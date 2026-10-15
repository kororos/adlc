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
  git -C "$REPO_DIR" clean --quiet -fd
}

ensure_dirs() {
  mkdir -p "$RUNS_DIR" "$STATE_DIR/running" "$LOG_DIR/runs" "$ADLC_WS/sessions"
}
