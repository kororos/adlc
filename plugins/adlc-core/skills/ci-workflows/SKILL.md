---
name: ci-workflows
description: GitHub Actions workflow templates for ADLC projects. CI runs the same adlc.build.yaml commands as the agents (lint, typecheck, arch-check, test), image publishing runs on the ADLC CI runner with the publish environment, and nightly runs the full suite and opens regression issues. Load when creating or changing .github/workflows (walking skeleton, CI changes).
---

# CI workflows

Templates are in `templates/`. Copy them to `.github/workflows/` and adapt. Rules:
- **Single source of commands:** CI runs `adlc.build.yaml` commands (via `yq`), never a second copy, so agents and CI can't drift.
- **Gate first:** every job starts with `.github/scripts/adlc-gate.sh` (template `adlc-gate.sh`) and runs its other steps only `if: steps.gate.outputs.run == 'true'`. The gate skips (reporting success) while `adlc.build.yaml status` isn't `active` (except for jobs listed in `ci.active`, which run as soon as their commands work), on docs-only changes, and (with path globs as arguments, e.g. from `ci.e2e_android_paths`) when nothing under those paths changed, so required checks report on every PR, including setup, discovery and architecture PRs before any code exists. It fails closed. Never use workflow-level `paths` filters on required checks: a workflow that doesn't run leaves its checks "expected" forever and blocks the merge.
- **Bootstrap at setup:** `/adlc-core:init` ships `ci.yml`, the stack's `e2e.yml` and the gate in the setup PR, so the required checks exist from the first PR. The walking skeleton switches jobs on as soon as their commands work: e.g. `ci.active: [lint, typecheck, arch-check]` in the first skeleton issue, then `status: active` once the test environment exists. Green checks for a job that isn't switched on prove nothing, so don't leave working jobs off.
- **Job names = required checks** in branch protection (`lint`, `typecheck`, `arch-check`, `test`, `e2e-web`, `e2e-android`…). Renaming a job breaks merging: treat it as high risk.
- **Runners:** `runs-on` comes from repository variables: `ADLC_TEST_RUNS_ON` (default `"ubuntu-latest"`, or `["self-hosted","adlc-test"]`) and `ADLC_PUBLISH_RUNS_ON` (`["self-hosted","adlc-publish"]`). Set them with `gh variable set` (JSON).
- **Publish** only on `push` to the default branch, with `environment: publish` (registry push credentials live only there), `docker build --pull`, and tags `sha-<7>` plus the version on release. **Scan before push** with Trivy (the scanner Harbor uses): an image with findings at or above `ADLC_SCAN_FAIL_ON` (repo variable, default `CRITICAL`, kept equal to the registry project's "prevent vulnerable images" threshold) is not pushed and the job fails with the table. Otherwise the registry refuses to serve it and the dev deployer waits silently. Fix it in the image (minimal runtime base, see the stack pack) or the dependencies, never by lowering the threshold in a PR.
- **Permissions:** least privilege per workflow (`contents: read` by default). No `pull_request_target`. Never echo secrets.
- **Release PR checks:** release-please's PR is opened with `GITHUB_TOKEN`, which starts no workflows. So every workflow with required checks also has `workflow_dispatch:`, and `release.yml` dispatches them on the release branch (list them in its `WORKFLOWS`). The gate skips a version-only change, so they report success quickly. Without this the release PR waits for "expected" checks. release-please rebuilds its PR only for releasable commits, so after other merges the PR falls behind: `release.yml` rebases it before dispatching (and warns, asking for "Update branch", if GitHub refuses). If a project has arch tests that pin workflow permissions or commands, update them in the same PR.
- **Prod is not deployed from CI.** The owner runs `adlc-swarm-deploy` on the manager. Don't add deploy jobs, and never add push or tag triggers that touch prod.
- Changes under `.github/` need the owner's review (CODEOWNERS).

| Template | Purpose |
|---|---|
| `adlc-gate.sh` | copy to `.github/scripts/`: decides per job whether to run (see "Gate first") |
| `ci.yml` | PR and main checks from `adlc.build.yaml` |
| `publish.yml` | build and push images to the registry (`registry.namespace`, `registry.images` in adlc.yaml) |
| `release.yml` | release-please release PR (when `release.tool` is release-please); dispatches the required-check workflows on it |
| `nightly.yml` | full test and e2e suite on main; opens or updates an `adlc:regression` issue on failure |

Stack-specific e2e jobs (`e2e-web`, `e2e-android`, `e2e-ios`) are in the stack pack (for React Native: `stack-react-native:rn-test-env`, `templates/e2e.yml`).
