#!/usr/bin/env bash
# Generates squid.conf from the project's adlc.yaml (mounted read-only at /project/adlc.yaml)
# and reloads Squid whenever the policy changes on the default branch.
set -euo pipefail

POLICY=/project/adlc.yaml
CONF=/etc/squid/squid.conf
ALLOW=/etc/squid/adlc-allowed.txt
LOG=/var/log/squid

log() { printf '%s [egress] %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }

# Squid refuses an ACL where one entry is covered by another (".a.example.com" under ".example.com",
# or "example.com" under ".example.com"). Drop covered entries.
drop_covered() {
  awk '{ d[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) {
        e = d[i]; x = e; sub(/^\./, "", x); keep = 1
        for (j = 1; j <= NR && keep; j++) {
          if (i == j || substr(d[j], 1, 1) != ".") continue
          b = substr(d[j], 2)
          if (x == b && e != d[j]) keep = 0
          else if (length(x) > length(b) && substr(x, length(x) - length(b)) == "." b) keep = 0
        }
        if (keep) print e
      }
    }'
}

policy_value() { [ -f "$POLICY" ] && yq -r "($1) // \"\"" "$POLICY" 2>/dev/null || true; }

render() {
  local mode stacks
  mode=$(policy_value '.network.mode'); mode=${mode:-${ADLC_NETWORK_MODE:-audit}}
  stacks=$(policy_value '.stacks[]')

  {
    cat /etc/adlc/domains/core.txt
    for s in $stacks; do [ -f "/etc/adlc/domains/$s.txt" ] && cat "/etc/adlc/domains/$s.txt"; done
    [ "${ADLC_CI:-}" = 1 ] && cat /etc/adlc/domains/ci.txt
    policy_value '.network.extra_domains[]'
  } | sed -E 's/#.*//; s/[[:space:]]+//g' | grep -v '^$' | sort -u | drop_covered >"$ALLOW.new"

  cat >"$CONF.new" <<EOF
http_port 3128
pid_filename /run/squid/squid.pid
cache deny all
coredump_dir /tmp
via off
forwarded_for delete
acl localnet src 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
acl SSL_ports port 443
acl Safe_ports port 80 443
acl CONNECT method CONNECT
EOF
  # Tests reach the project's own preview URLs (<run>.app.<slug>.<base>:<edge port>), which resolve
  # to the dev server. Only those names, only on the edge port, only plain HTTP.
  if [ -n "${ADLC_PREVIEW_DOMAIN:-}" ] && [[ "${ADLC_EDGE_PORT:-}" =~ ^[0-9]+$ ]]; then
    cat >>"$CONF.new" <<EOF
acl adlc_preview dstdomain .${ADLC_PREVIEW_DOMAIN}
acl adlc_edge_port port ${ADLC_EDGE_PORT}
http_access allow localnet adlc_preview adlc_edge_port !CONNECT
EOF
  fi
  cat >>"$CONF.new" <<EOF
http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
acl adlc_allowed dstdomain "$ALLOW"
EOF
  if [ "$mode" = allowlist ]; then
    echo "http_access allow localnet adlc_allowed" >>"$CONF.new"
  else
    echo "http_access allow localnet" >>"$CONF.new"
  fi
  cat >>"$CONF.new" <<EOF
http_access deny all
logformat adlc %ts %>a %rm %ru %>Hs %Ss
access_log stdio:$LOG/access.log adlc
logfile_rotate 3
cache_log stdio:$LOG/cache.log
EOF
  # Validate before activating; on failure keep the previous (working) configuration.
  local acl_line="acl adlc_allowed dstdomain \"$ALLOW\""
  if ! sed "s#^$acl_line\$#acl adlc_allowed dstdomain \"$ALLOW.new\"#" "$CONF.new" >"$CONF.check" \
     || ! squid -k parse -f "$CONF.check" >/dev/null 2>&1; then
    log "ERROR: generated proxy config is invalid; keeping the previous one (see: squid -k parse -f $CONF.check)"
    return 1
  fi
  mv "$ALLOW.new" "$ALLOW"; mv "$CONF.new" "$CONF"
  echo "$mode"
}

mkdir -p "$LOG" /run/squid
chown -R proxy:proxy "$LOG" /run/squid
mode=$(render) || { [ -f "$CONF" ] || exit 1; mode=unknown; }
log "mode=$mode, $(wc -l <"$ALLOW") allowlisted domains"

# Reload when the policy file changes (the poller keeps the shared clone at origin/<default>).
# Squid runs as PID 1 (exec below), where `squid -k` refuses to act: signal it directly
# (HUP = reconfigure, USR1 = rotate logs).
(
  last=$(stat -c %Y "$POLICY" 2>/dev/null || echo 0)
  while sleep 60; do
    # Keep the access log bounded: rotate past 50 MB (access.log.0 … .2 are kept).
    if [ "$(stat -c %s "$LOG/access.log" 2>/dev/null || echo 0)" -gt $(( ${ADLC_EGRESS_LOG_MAX_MB:-50} * 1048576 )) ]; then
      kill -USR1 1 && log "access log rotated"
    fi
    now=$(stat -c %Y "$POLICY" 2>/dev/null || echo 0)
    [ "$now" = "$last" ] && continue
    last=$now
    mode=$(render) && kill -HUP 1 && log "policy changed: mode=$mode"
  done
) &

exec squid -N -f "$CONF"
