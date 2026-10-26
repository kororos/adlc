#!/usr/bin/env bash
# Shared helpers for ADLC runner scripts. Source this file; don't execute it.

: "${ADLC_ROOT:?ADLC_ROOT is not set}" "${ADLC_SLUG:?ADLC_SLUG is not set}"

ADLC_WS="$ADLC_ROOT/projects/$ADLC_SLUG"
REPO_DIR="$ADLC_WS/repo"
RUNS_DIR="$ADLC_WS/runs"
STATE_DIR="$ADLC_WS/state"
LOG_DIR="$ADLC_WS/logs"
SECRETS_DIR="${ADLC_SECRETS_DIR:-/run/secrets}"
export ADLC_WS REPO_DIR RUNS_DIR STATE_DIR LOG_DIR

log() { printf '%s [%s] %s\n' "$(date -u +%FT%TZ)" "${ADLC_COMPONENT:-adlc}" "$*" >&2; }
die() { log "FATAL: $*"; exit 1; }

# Print a secret's value (no trailing newline); empty if missing.
secret() {
  local f="$SECRETS_DIR/$1"
  [ -s "$f" ] && tr -d '[:space:]' <"$f"
  return 0
}

# Read from the project's policy / build profile on the default branch (shared clone).
# Prints "" when the file or key is missing.
cfg() {
  [ -f "$REPO_DIR/adlc.yaml" ] || return 0
  yq -r "($1) // \"\"" "$REPO_DIR/adlc.yaml" 2>/dev/null || true
}
# cfg_raw <path> <default>: like cfg, but keeps false and 0 (yq's // treats false as unset).
cfg_raw() {
  local v=""
  [ -f "$REPO_DIR/adlc.yaml" ] && v=$(yq -r "$1" "$REPO_DIR/adlc.yaml" 2>/dev/null || true)
  [ -n "$v" ] && [ "$v" != null ] && echo "$v" || echo "$2"
}
build_cfg() {
  [ -f "$REPO_DIR/adlc.build.yaml" ] || return 0
  yq -r "($1) // \"\"" "$REPO_DIR/adlc.build.yaml" 2>/dev/null || true
}

default_branch() {
  local b
  b=$(git -C "$REPO_DIR" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null) || b=""
  b=${b#origin/}
  [ -n "$b" ] || b=$(cfg '.repo.default_branch')
  echo "${b:-main}"
}

slugify() {
  tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-40 | sed -E 's/-+$//'
}

repo_ready() { [ -d "$REPO_DIR/.git" ]; }

# Bring the shared clone to exactly origin/<default>. It is never a place where work happens.
sync_repo() {
  repo_ready || return 1
  git -C "$REPO_DIR" fetch --quiet --prune origin || return 1
  local b; b=$(default_branch)
  git -C "$REPO_DIR" checkout --quiet --force "$b" 2>/dev/null \
    || git -C "$REPO_DIR" checkout --quiet --force -B "$b" "origin/$b" || return 1
  git -C "$REPO_DIR" reset --quiet --hard "origin/$b"
  # Remote Control puts on-demand session worktrees under .claude/worktrees: never touch them.
  git -C "$REPO_DIR" clean --quiet -fd --exclude=.claude/worktrees/
}

# Settings for every claude the runner starts: the project's .claude/settings.json declares the "adlc"
# marketplace from GitHub (for people's own clones). Here it's the local copy (ADLC_MARKETPLACE); without
# this override each run tries to clone the GitHub repo, which fails for a private repo.
claude_settings() {
  jq -cn --arg p "${ADLC_MARKETPLACE:-/opt/adlc}" '{extraKnownMarketplaces: {adlc: {source: {source: "directory", path: $p}}}}'
}

ensure_dirs() {
  mkdir -p "$RUNS_DIR" "$STATE_DIR/running" "$LOG_DIR/runs" "$ADLC_WS/sessions" "$ADLC_WS/locks"
}

# ── Disk housekeeping (the project's Docker sidecar; used by the poller and adlc-housekeep) ─────
# Every verify attempt rebuilds the run's images; the old ones become dangling, and a run's images
# outlive its issue. Remove those and keep the build cache under a cap. Pulled base images
# (emulator, browsers) stay, so builds stay fast.
# Cap the build cache (Docker 29 renamed --keep-storage to --reserved-space).
prune_build_cache() {
  if docker builder prune --help 2>/dev/null | grep -q -- --reserved-space; then
    docker builder prune -f --reserved-space "$1" >/dev/null 2>&1 || true
  else
    docker builder prune -f --keep-storage "$1" >/dev/null 2>&1 || true
  fi
}
# Images no container uses, by how long ago they were last built, pulled or tagged (each rebuild or
# pull resets the clock, so images in use stay):
#   - built by docker compose (label com.docker.compose.project: test environments, whatever the
#     agents named them): after ADLC_BUILT_IMAGE_MAX_IDLE_H hours (default 6); they rebuild quickly
#     from the build cache,
#   - anything else (pulled base images, plain builds): after ADLC_IMAGE_MAX_IDLE_H hours (default 48).
# Images whose tag starts with an entry of ADLC_KEEP_IMAGES (space-separated, default: the Android
# emulator) or of the first argument are kept. (Docker 29's containerd store gives local builds a
# digest too, so "pulled vs built" can't be told apart by digest.) An image a container uses can't
# be removed: no -f.
prune_finished_runs() {
  local built_age=$(( ${ADLC_BUILT_IMAGE_MAX_IDLE_H:-6} * 3600 )) max_age=$(( ${ADLC_IMAGE_MAX_IDLE_H:-48} * 3600 ))
  local now id refs tagged keep k skip age limit
  keep="${ADLC_KEEP_IMAGES:-budtmo/docker-android} ${1:-}"
  now=$(date +%s)
  docker images -q --no-trunc 2>/dev/null | sort -u | while read -r id; do
    refs=$(docker image inspect -f '{{range .RepoTags}}{{.}} {{end}}' "$id" 2>/dev/null) || continue
    skip=0
    for k in $keep; do case " $refs" in *" $k"*) skip=1 ;; esac; done
    [ "$skip" = 0 ] || continue
    limit=$max_age
    [ -n "$(docker image inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$id" 2>/dev/null)" ] && limit=$built_age
    tagged=$(docker image inspect -f '{{if .Metadata.LastTagTime.IsZero}}{{.Created}}{{else}}{{.Metadata.LastTagTime}}{{end}}' "$id" 2>/dev/null)
    age=$(( now - $(date -d "${tagged% UTC}" +%s 2>/dev/null || echo "$now") ))
    [ "$age" -ge "$limit" ] || continue
    # shellcheck disable=SC2086  # one tag per word
    { [ -n "$refs" ] && docker rmi $refs; } >/dev/null 2>&1 || docker rmi "$id" >/dev/null 2>&1 || true
  done
}
# One line per Docker engine for status output: images, build cache, volumes (size / reclaimable).
engine_usage() { # docker system df measures every layer: bounded, it can take minutes on a full disk
  timeout 120 docker system df --format '{{.Type}}|{{.Size}}|{{.Reclaimable}}' 2>/dev/null \
    | awk -F'|' '$1 != "Containers" { sub(/ .*/, "", $3); printf "%s%s %s (%s reclaimable)", sep, tolower($1), $2, $3; sep=" · " } END { print "" }'
}
free_gb() { df -Pk "$ADLC_ROOT" 2>/dev/null | awk 'NR==2 { print int($4 / 1048576) }'; }
housekeep() {
  local before after
  before=$(free_gb)
  prune_finished_runs
  docker image prune -f >/dev/null 2>&1 || true
  prune_build_cache "${ADLC_BUILD_CACHE_KEEP:-6GB}"
  docker volume prune -f >/dev/null 2>&1 || true
  # Component logs over 100 MB keep their last 20 MB, trimmed in place: their writers hold the file open.
  find "$LOG_DIR" -maxdepth 1 -name '*.log' -size +100M -exec sh -c 'tail -c 20M "$1" >"$1.tmp" && cat "$1.tmp" >"$1"; rm -f "$1.tmp"' _ {} \; 2>/dev/null || true
  after=$(free_gb)
  # For the dashboard's Health tab (it has no Docker access).
  engine_usage >"$STATE_DIR/docker_usage.tmp" 2>/dev/null && mv "$STATE_DIR/docker_usage.tmp" "$STATE_DIR/docker_usage"
  log "housekeeping: finished runs' images, dangling images and build cache pruned (free ${before:-?}GB → ${after:-?}GB)"
}
