#!/usr/bin/env bash
# .github/scripts/adlc-gate.sh: decides whether a CI job does real work (output run=true|false).
#
# Required checks must report on every PR, including the setup, discovery and architecture PRs
# that come before any code exists. So every job runs this first and skips its remaining steps
# (still reporting success) when:
#   - adlc.build.yaml is missing or its `status` isn't `active` (the walking skeleton sets it), or
#   - the pull request only changes docs (docs/, .adlc/, *.md).
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

if [ "${GITHUB_EVENT_NAME:-}" = pull_request ]; then
  # The checkout is the PR's merge commit: its first parent is the base branch tip.
  changed=$(git diff --name-only HEAD^1 HEAD)
  if [ -n "$changed" ] && ! grep -qvE '^(docs/|\.adlc/)|\.md$' <<<"$changed"; then
    skip "docs-only change"
  fi
fi
echo "run=true" >>"$out"
