#!/usr/bin/env bash
# .github/scripts/adlc-gate.sh [--status-only | path-glob...]: decides whether a CI job does real work
# (output run=true|false).
#
# Required checks must report on every PR, including the setup, discovery and architecture PRs
# that come before any code exists. So every job runs this first and skips its remaining steps
# (still reporting success) when:
#   - adlc.build.yaml is missing, or its `status` isn't `active` (the walking skeleton sets it) and
#     this job isn't listed in `ci.active` (jobs that already work, switched on one by one),
#   - the change only touches docs (docs/, .adlc/, *.md),
#   - the change is a release-please release PR: only *.md, .release-please-manifest.json and the
#     version fields release-please-config.json names (checked: nothing else in those files moved), or
#   - path globs are given and no changed file matches one (e.g. 'apps/mobile/*' for e2e-android;
#     `*` also matches `/`).
#   - it is a push to the default branch whose commit has exactly the files of a merged PR's head on
#     which this job already passed (the merge train brings a PR up to date before it squash-merges
#     it, so main's run would test the same code again). Needs GH_TOKEN (pull-requests: read,
#     checks: read) on the gate step; without it, or on any doubt, the job runs.
# With `--status-only` as the first argument only the first skip applies (no docs-only, release or
# path skips). publish.yml uses it so that every push to the default branch publishes its images.
# Never use workflow-level `paths:` filters on required checks instead: a workflow that doesn't
# run leaves its checks "expected" forever.
# It fails closed: any error here fails the job. /adlc.build.yaml and /.github/ are in CODEOWNERS,
# so nobody can switch CI off without the owner's review.
set -euo pipefail
status_only=false
if [ "${1:-}" = "--status-only" ]; then status_only=true; shift; fi
out=${GITHUB_OUTPUT:-/dev/stdout}

skip() {
  echo "::notice title=${GITHUB_JOB:-job} skipped::$1"
  echo "run=false" >>"$out"
  exit 0
}

# yq reads adlc.build.yaml here and in the job's later steps. Hosted runners have it; the plain
# actions-runner image used by the ADLC CI runner doesn't, so install a pinned, verified copy
# and put it on the job's PATH.
ensure_yq() {
  command -v yq >/dev/null && return
  local v=v4.44.3 arch sum dir
  case $(uname -m) in
    x86_64) arch=amd64 sum=a2c097180dd884a8d50c956ee16a9cec070f30a7947cf4ebf87d5f36213e9ed7 ;;
    aarch64|arm64) arch=arm64 sum=0e7e1524f68d91b3ff9b089872d185940ab0fa020a5a9052046ef10547023156 ;;
    *) echo "::error::no pinned yq for $(uname -m)"; exit 1 ;;
  esac
  dir="${RUNNER_TEMP:-/tmp}/adlc-bin"; mkdir -p "$dir"
  curl -fsSL --retry 3 "https://github.com/mikefarah/yq/releases/download/$v/yq_linux_$arch" -o "$dir/yq"
  echo "$sum  $dir/yq" | sha256sum -c --quiet -
  chmod +x "$dir/yq"
  export PATH="$dir:$PATH"
  if [ -n "${GITHUB_PATH:-}" ]; then echo "$dir" >>"$GITHUB_PATH"; fi
}

[ -f adlc.build.yaml ] || skip "no adlc.build.yaml yet"
ensure_yq
status=$(yq '.status // "draft"' adlc.build.yaml)
if [ "$status" != active ]; then
  JOB=${GITHUB_JOB:-} yq -e '(.ci.active // []) | contains([env(JOB)])' adlc.build.yaml >/dev/null 2>&1 \
    || skip "adlc.build.yaml status is '$status' and ci.active doesn't list '${GITHUB_JOB:-?}' (the walking skeleton switches jobs on)"
fi

# The JSON files release-please bumps and the field it bumps in each (path<TAB>yq path): each
# package's package.json (release-type node) and its json extra-files with a plain $.a.b jsonpath.
release_fields() {
  yq -p json -o tsv '(."release-type" // "") as $rt | .packages | to_entries | .[]
    | select((.value."release-type" // $rt) == "node")
    | [(.key | sub("^\\.$"; "") | sub("([^/])$"; "${1}/")) + "package.json", ".version"]' \
    release-please-config.json
  yq -p json -o tsv '.packages | to_entries | .[] | .key as $k | (.value."extra-files" // [])[]
    | select(tag == "!!map" and .type == "json" and (.jsonpath | test("^\\$(\\.[A-Za-z0-9_-]+)+$")))
    | [($k | sub("^\\.$"; "") | sub("([^/])$"; "${1}/")) + .path, (.jsonpath | sub("^\\$"; ""))]' \
    release-please-config.json
}

# True when every changed file is release-please's own: *.md, the manifest, or a JSON file in which
# only its version field differs. A file it doesn't know about makes this false (the jobs run).
release_only() {
  [ -f release-please-config.json ] || return 1
  local fields f path before after
  fields=$(release_fields 2>/dev/null) || return 1
  while IFS= read -r f; do
    case $f in *.md|.release-please-manifest.json) continue ;; esac
    path=$(awk -F'\t' -v f="$f" '$1 == f { print $2; exit }' <<<"$fields")
    [ -n "$path" ] || return 1
    before=$(git show "HEAD^1:$f" | yq -p json -o json "del($path)") || return 1
    after=$(git show "HEAD:$f" | yq -p json -o json "del($path)") || return 1
    [ "$before" = "$after" ] || return 1
  done <<<"$1"
}

if [ "$status_only" = true ]; then
  echo "run=true" >>"$out"
  exit 0
fi

# Push to the default branch: the PR this commit merged, when its head has the same tree and this
# job's check passed on that head. Any error, a different tree or no passed check: run.
already_tested() {
  [ "${GITHUB_EVENT_NAME:-}" = push ] && [ -n "${GH_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] || return 1
  local api=${GITHUB_API_URL:-https://api.github.com}/repos/$GITHUB_REPOSITORY sha tree pr head name
  get() { curl -fsSL --retry 3 -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" "$api/$1"; }
  sha=$(git rev-parse HEAD) tree=$(git rev-parse 'HEAD^{tree}') name=${ADLC_CHECK_NAME:-${GITHUB_JOB:-}}
  [ -n "$name" ] || return 1
  pr=$(get "commits/$sha/pulls" | SHA=$sha yq -p json '[.[] | select(.merge_commit_sha == env(SHA))][0] | (.number | tostring) + " " + (.head.sha // "")') || return 1
  read -r pr head <<<"$pr"
  [ -n "$head" ] && [ "$head" != null ] || return 1
  [ "$(get "git/commits/$head" | yq -p json '.tree.sha')" = "$tree" ] || return 1
  get "commits/$head/check-runs?check_name=$name&filter=latest" \
    | yq -p json -e '[.check_runs[] | select(.app.slug == "github-actions" and .conclusion == "success")] | length > 0' >/dev/null || return 1
  echo "PR #$pr ($head)"
}
if tested=$(already_tested 2>/dev/null); then
  skip "this commit has exactly the files of $tested, on which ${ADLC_CHECK_NAME:-$GITHUB_JOB} passed"
fi

# Pull request: the checkout is the merge commit, whose first parent is the base branch tip.
# Push to main: squash merges make each push one commit. Dispatched run on a release-please
# branch (see release.yml): one commit on top of the default branch. (Needs fetch-depth: 2.)
if git rev-parse --verify --quiet HEAD^1 >/dev/null; then
  changed=$(git diff --name-only HEAD^1 HEAD)
  if [ -n "$changed" ] && ! grep -qvE '^(docs/|\.adlc/)|\.md$' <<<"$changed"; then
    skip "docs-only change"
  fi
  if [ -n "$changed" ] && release_only "$changed"; then
    skip "release-please version bump only"
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
