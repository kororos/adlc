#!/usr/bin/env bash
# .github/scripts/adlc-gate.sh [path-glob...]: decides whether a CI job does real work
# (output run=true|false).
#
# Required checks must report on every PR, including the setup, discovery and architecture PRs
# that come before any code exists. So every job runs this first and skips its remaining steps
# (still reporting success) when:
#   - adlc.build.yaml is missing or its `status` isn't `active` (the walking skeleton sets it),
#   - the change only touches docs (docs/, .adlc/, *.md), or
#   - path globs are given and no changed file matches one (e.g. 'apps/mobile/*' for e2e-android;
#     `*` also matches `/`).
# Never use workflow-level `paths:` filters on required checks instead: a workflow that doesn't
# run leaves its checks "expected" forever.
# It fails closed: any error here fails the job. /adlc.build.yaml and /.github/ are in CODEOWNERS,
# so nobody can switch CI off without the owner's review.
set -euo pipefail
out=${GITHUB_OUTPUT:-/dev/stdout}

skip() {
  echo "::notice title=${GITHUB_JOB:-job} skipped::$1"
  echo "run=false" >>"$out"
  exit 0
}

[ -f adlc.build.yaml ] || skip "no adlc.build.yaml yet"
status=$(yq '.status // "draft"' adlc.build.yaml)
[ "$status" = active ] || skip "adlc.build.yaml status is '$status' (the walking skeleton sets it to active)"

# Pull request: the checkout is the merge commit, whose first parent is the base branch tip.
# Push to main: squash merges make each push one commit. (Needs actions/checkout fetch-depth: 2.)
if git rev-parse --verify --quiet HEAD^1 >/dev/null; then
  changed=$(git diff --name-only HEAD^1 HEAD)
  if [ -n "$changed" ] && ! grep -qvE '^(docs/|\.adlc/)|\.md$' <<<"$changed"; then
    skip "docs-only change"
  fi
  if [ $# -gt 0 ]; then
    match=false
    while IFS= read -r f; do
      for pat in "$@"; do
        # shellcheck disable=SC2053  # glob match on purpose
        [[ $f == $pat ]] && { match=true; break 2; }
      done
    done <<<"$changed"
    [ "$match" = true ] || skip "no changes under: $*"
  fi
fi
echo "run=true" >>"$out"
