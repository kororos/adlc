#!/usr/bin/env bash
# ADLC PreToolUse guard. Reads the hook payload on stdin; exit 2 blocks the call
# and feeds stderr back to the model.
set -euo pipefail

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")

block() { echo "ADLC guard: $1" >&2; exit 2; }

is_secret_path() {
  local p=$1 base
  base=$(basename -- "$p")
  case "$base" in
    .env.example|.env.sample|.env.template) return 1 ;;
    .env|.env.*|*.pem|*.key|id_rsa*|id_ed25519*|*.p12|*.keystore|*.jks|google-services.json|GoogleService-Info.plist) return 0 ;;
  esac
  return 1
}

# Project setup facts (adlc.yaml, CLAUDE.md, docs/project/) are changed only via
# /adlc-core:init --update in an interactive session.
is_setup_path() {
  case "$1" in
    adlc.yaml|*/adlc.yaml|CLAUDE.md|*/CLAUDE.md|docs/project/*|*/docs/project/*) return 0 ;;
  esac
  return 1
}
unattended() { [ "${ADLC_MODE:-}" = "unattended" ]; }

case "$tool" in
  Read|Edit|Write)
    path=$(jq -r '.tool_input.file_path // ""' <<<"$input")
    if is_secret_path "$path"; then
      block "access to secret file '$path' is not allowed. Use the matching .example file or ask for the env var name."
    fi
    if [ "$tool" != "Read" ] && unattended && is_setup_path "$path"; then
      block "project setup files (adlc.yaml, CLAUDE.md, docs/project/) are read-only in unattended runs: only the owner changes them, with /adlc-core:init --update <section> in an interactive session. Keep the work that stays consistent without them on the branch, then return STATUS: blocked with the exact command for the owner (e.g. /adlc-core:init --update secrets) and what to record."
    fi
    ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
    protected="${ADLC_PROTECTED_BRANCHES:-main|master|develop|release/.*}"

    if grep -Eq 'git[[:space:]]+push([^;&|]*)(--force([^-]|$)|--force-with-lease|[[:space:]]-f([[:space:]]|$)|[[:space:]]\+)' <<<"$cmd"; then
      block "force-push is not allowed."
    fi
    if grep -Eq "git[[:space:]]+push[^;&|]*[[:space:]:](${protected})([[:space:]]|$)" <<<"$cmd"; then
      block "pushing to a protected branch is not allowed; open a PR instead."
    fi
    if grep -Eq 'gh[[:space:]]+pr[[:space:]]+merge' <<<"$cmd" && ! grep -Eq -- '--auto' <<<"$cmd"; then
      block "direct PR merges are not allowed; use 'gh pr merge --auto' so branch protection and CI decide."
    fi
    if grep -Eq 'gh[[:space:]]+(repo[[:space:]]+(delete|edit)|api[[:space:]].*-X[[:space:]]*(DELETE|PUT)[^;&|]*branches/[^/]+/protection)' <<<"$cmd"; then
      block "repository administration commands are not allowed."
    fi
    if grep -Eq 'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f?[[:space:]]+(/|~|\$HOME)([[:space:]]|$)' <<<"$cmd"; then
      block "recursive delete of root/home is not allowed."
    fi
    if unattended && grep -Eq '(>|sed[[:space:]]+-i|tee|mv|cp|rm)[^;&|]*(adlc\.yaml|CLAUDE\.md|docs/project/)' <<<"$cmd"; then
      block "project setup files are read-only in unattended runs."
    fi
    if grep -Eq '(cat|less|more|head|tail|source|\.)[[:space:]]+[^;&|]*\.env([[:space:]]|$|\.[a-z]+)' <<<"$cmd" \
       && ! grep -Eq '\.env\.(example|sample|template)' <<<"$cmd"; then
      block "reading .env files is not allowed."
    fi
    ;;
esac
exit 0
