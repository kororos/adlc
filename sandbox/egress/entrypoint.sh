#!/usr/bin/env bash
# Generates squid.conf from the project's adlc.yaml (mounted read-only at /project/adlc.yaml)
# and reloads Squid whenever the policy changes on the default branch.
set -euo pipefail

POLICY=/project/adlc.yaml
CONF=/etc/squid/squid.conf
ALLOW=/etc/squid/adlc-allowed.txt
LOG=/var/log/squid

log() { printf '%s [egress] %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }

policy_value() { [ -f "$POLICY" ] && yq -r "($1) // \"\"" "$POLICY" 2>/dev/null || true; }

render() {
  local mode stacks
  mode=$(policy_value '.network.mode'); mode=${mode:-${ADLC_NETWORK_MODE:-audit}}
  stacks=$(policy_value '.stacks[]')

  {
    cat /etc/adlc/domains/core.txt
    for s in $stacks; do [ -f "/etc/adlc/domains/$s.txt" ] && cat "/etc/adlc/domains/$s.txt"; done
    policy_value '.network.extra_domains[]'
  } | sed -E 's/#.*//; s/[[:space:]]+//g' | grep -v '^$' | sort -u >"$ALLOW.new"

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
cache_log stdio:$LOG/cache.log
EOF
  mv "$ALLOW.new" "$ALLOW"; mv "$CONF.new" "$CONF"
  echo "$mode"
}

mkdir -p "$LOG" /run/squid
chown -R proxy:proxy "$LOG" /run/squid
mode=$(render)
log "mode=$mode, $(wc -l <"$ALLOW") allowlisted domains"

# Reload when the policy file changes (the poller keeps the shared clone at origin/<default>).
(
  last=$(stat -c %Y "$POLICY" 2>/dev/null || echo 0)
  while sleep 60; do
    now=$(stat -c %Y "$POLICY" 2>/dev/null || echo 0)
    [ "$now" = "$last" ] && continue
    last=$now
    mode=$(render) && squid -k reconfigure -f "$CONF" && log "policy changed: mode=$mode"
  done
) &

exec squid -N -f "$CONF"
