---
name: ci-workflows
description: GitHub Actions workflow templates for ADLC projects. CI runs the same adlc.build.yaml commands as the agents (lint, typecheck, arch-check, test), image publishing runs on the ADLC CI runner with the publish environment, and nightly runs the full suite and opens regression issues. Load when creating or changing .github/workflows (walking skeleton, CI changes).
---

# CI workflows

Templates are in `templates/`. Copy them to `.github/workflows/` and adapt. Rules:
- **Single source of commands:** CI runs `adlc.build.yaml` commands (via `yq`), never a second copy, so agents and CI can't drift.
- **Job names = required checks** in branch protection (`lint`, `typecheck`, `arch-check`, `test`, `e2e-web`, `e2e-android`…). Renaming a job breaks merging: treat it as high risk.
- **Runners:** `runs-on` comes from repository variables: `ADLC_TEST_RUNS_ON` (default `"ubuntu-latest"`, or `["self-hosted","adlc-test"]`) and `ADLC_PUBLISH_RUNS_ON` (`["self-hosted","adlc-publish"]`). Set them with `gh variable set` (JSON).
- **Publish** only on `push` to the default branch, with `environment: publish` (registry push credentials live only there), `docker build --pull`, and tags `sha-<7>` plus the version on release.
- **Permissions:** least privilege per workflow (`contents: read` by default). No `pull_request_target`. Never echo secrets.
- **Prod is not deployed from CI.** The owner runs `adlc-swarm-deploy` on the manager. Don't add deploy jobs, and never add push or tag triggers that touch prod.
- Changes under `.github/` need the owner's review (CODEOWNERS).

| Template | Purpose |
|---|---|
| `ci.yml` | PR and main checks from `adlc.build.yaml` |
| `publish.yml` | build and push images to the registry (`registry.namespace`, `registry.images` in adlc.yaml) |
| `nightly.yml` | full test and e2e suite on main; opens or updates an `adlc:regression` issue on failure |

Stack-specific e2e jobs (`e2e-web`, `e2e-android`, `e2e-ios`) are in the stack pack (for React Native: `stack-react-native:rn-test-env`, `templates/e2e.yml`).
