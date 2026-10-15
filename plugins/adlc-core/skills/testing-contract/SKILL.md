---
name: testing-contract
description: ADLC core testing contract. Covers test levels, when each runs, environment lifecycle (env.up/seed/start/down), e2e target scheduling (parallel/exclusive/ci), flaky-test policy and QA report rules. Stack packs implement it; projects configure it in adlc.build.yaml. Load when writing, running or judging tests in an ADLC run.
user-invocable: false
---

# ADLC testing contract

The core defines **when** tests run and **what counts as passing**. Stack packs define **how** (tools, sidecars, patterns). The project's `adlc.build.yaml` supplies the concrete commands.

## Test levels
| Level | Written by | Runs | Gate |
|---|---|---|---|
| unit | test-designer, implementer | every verify (`commands.test`) | blocking |
| integration (API + real Postgres/Redis) | test-designer | every verify | blocking |
| component (UI in isolation) | test-designer | every verify | blocking |
| architecture checks | solution-architect (defined), build-runner (runs) | every verify (`commands.arch_check`) | blocking |
| e2e scripted | qa-engineer | per run: `testing.e2e.per_run`; nightly: `testing.e2e.nightly` | blocking |
| e2e exploratory | qa-engineer | UI-touching runs, if `testing.exploratory: true` | blocking findings only |
| CI (all of the above + `where: ci` targets) | GitHub Actions | every PR | required checks for merge |

## Environment lifecycle
Steps in `adlc.build.yaml env:` (all optional, all run with `ADLC_RUN=<issue>` exported):
`up` (sidecars; must be isolated per run, e.g. `docker compose -p adlc-$ADLC_RUN`) → `seed` (deterministic data) → `start_watch` **or** `start_build` (must return once healthy) → tests → `down` (the lead always runs it, even on abort).

Test environments run in the project's Docker-in-Docker sidecar, built **from the run's source folder**. No images are pushed to a registry. The registry is only for post-merge deployments.

| Mode | Command | What runs | Used by |
|---|---|---|---|
| `watch` | `env.start_watch` | Source mounted; API on a file watcher, Metro/Expo web with Fast Refresh; Android debug build loading JS from Metro (rebuilt only when the native fingerprint changes) | implementer, debugger, exploratory QA, humans previewing a run |
| `build` | `env.start_build` | Production-like build from the same source: compiled API, exported web bundle, release Android build; no watchers | **gating** e2e (qa-engineer), nightly |

Gating e2e never runs in `watch` mode, because a reload mid-test produces false failures. Switching modes means `down` → `up` → `seed` → the other start command.
### Networking rules for test and dev compose files (runner sandbox)
- **Egress:** containers started from the runner get the egress proxy injected (`HTTP(S)_PROXY`). Builds (`npm install` in a Dockerfile) need it. **Runtime services must set `NO_PROXY: "*"` and `no_proxy: "*"`.** Otherwise calls between services by name (`http://api:3000`) are sent to the proxy and refused. Test runtime never needs the internet, because external APIs are mocked. In the dev environment, a service that really calls an external API sets `NO_PROXY` to the internal service names instead.
- **Preview URLs:** web-facing services join the external network `adlc-web` and carry Traefik labels:
  ```yaml
  networks: [default, adlc-web]
  labels:
    traefik.enable: "true"
    traefik.http.routers.r${ADLC_RUN}-app.rule: Host(`${ADLC_RUN}.app.${ADLC_PROJECT_DOMAIN}`)
    traefik.http.services.r${ADLC_RUN}-app.loadbalancer.server.port: "8081"
  ```
  The URL is then `http://<run>.app.<slug>.<base-domain>` (likewise `<run>.api.…`). The dev environment uses `app.<slug>.<base-domain>`.
- Use only bind mounts under the project workspace (`$ADLC_ROOT/projects/<slug>/…`). That path is identical in the runner and the Docker sidecar.
Third-party HTTP APIs are mocked in test environments (stack-pack mechanism, e.g. MSW/WireMock). Tests never call real external services.

## E2E selection
- `smoke`: flows tagged `@smoke` (critical journeys; keep the total under 5 minutes per target).
- `affected`: flows that cover ACs of this issue or that touch files changed on the branch (by path convention or tag).
- `full`: everything.
`per_run` is usually `smoke+affected`. `nightly` is usually `full`, run on the default branch by a **scheduled GitHub Actions workflow**: deterministic, no agent tokens. On failure the workflow opens an issue labelled `adlc:ready` + `adlc:regression`.

## Target scheduling
Each `testing.e2e.targets.<name>` has `runner`, `cmd` and optionally:
- `parallel: true`: may run concurrently with other runs.
- `exclusive: true` + `requires: [<resource>]`: shared resource (e.g. one Android emulator). Hold the lock: `flock /locks/<resource>.lock <cmd>` (the runner image provides `/locks`).
- `where: ci` (+ `workflow:`): not runnable in the runner (e.g. iOS). Covered by the PR's required checks only.

## Flaky policy
A failed e2e flow is re-run once in isolation. Pass on retry → flaky: tag it `@quarantine` (excluded from gating), report it, and the lead opens a follow-up issue labelled `adlc:flaky`. Two consecutive failures → real failure (blocking). Never delete or weaken a flow to get green.

## Evidence
Keep traces, videos and screenshots only for failures, under `.adlc/runs/<n>/reports/artifacts/` (git-ignored). Reports reference them by path.
