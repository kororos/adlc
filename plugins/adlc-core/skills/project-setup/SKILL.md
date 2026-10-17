---
name: project-setup
description: ADLC new-project setup catalogue. Lists the questions (repo, CI, container registry, environments, mobile distribution, secrets, release, observability, notifications, compliance), their recommended defaults, where each answer is persisted (adlc.yaml, docs/project/setup.md, CLAUDE.md block) and the provisioning rules. Load for /adlc-core:init and whenever project setup facts are needed.
user-invocable: false
---

# ADLC project setup

Setup facts are **organisational and infrastructure decisions**: where things live, who owns them, what is allowed. Technical design (frameworks, data model, API style) belongs to `/architect`. When a question straddles both (for example hosting), init records the *constraint* ("must run on our EU cloud account") and the architect makes the *design* decision.

## Persistence (single source of truth → derived views)
| Where | What | Read by |
|---|---|---|
| `adlc.yaml` sections `project`, `repo`, `ci`, `registry`, `environments`, `mobile`, `release`, `deps`, `secrets`, `observability`, `notifications`, `compliance` | Machine-readable values. **Source of truth.** | All agents, poller, guard hook, CI templates |
| `docs/project/setup.md` | One entry per decision: value, rationale, date, owner. Open items. Change log. | Humans, solution-architect, feature-architect |
| `CLAUDE.md` between `<!-- adlc:setup:begin -->` and `<!-- adlc:setup:end -->` | ≤ 30-line digest of the facts every agent must always respect | Every session and subagent (auto-loaded) |
| `.adlc/provision.sh` | Idempotent script performing the privileged setup actions | Run by the human with admin credentials |

Rules:
- `tbd` is a valid answer. Agents must **never assume** a `tbd` value. If a task needs one, the agent returns `STATUS: blocked` naming the key. Every `tbd` appears under "Open items" in setup.md, with the phase that needs it (for example "before first staging deploy").
- Unattended runs cannot modify setup facts. The guard hook blocks edits to `adlc.yaml`, `CLAUDE.md` and `docs/project/` when `ADLC_MODE=unattended`. Changes go through `/adlc-core:init --update <section>` in an interactive session, and each one is logged in setup.md's change log.
- Never store a secret value in any of these files, only the secret's **name** and **where it lives**.

## Question catalogue
Ask in this order. Propose the default and explain it in one line. Accept "default", a custom value, or `tbd`. Skip whole sections that don't apply (`platforms` has no mobile → skip M).

### P — Project identity
| key | question | default |
|---|---|---|
| project.name / slug | Name and short slug (used for repo, images, compose project) | — |
| project.description | One-line description | — |
| project.owner | Accountable person or team (GitHub handle) | the current `gh` user |
| project.license | Licence | `proprietary` (private) / `MIT` (public) |

### R — Source control
| key | question | default |
|---|---|---|
| repo.url | GitHub owner/org and repo name; new or existing | `github.com/<owner>/<slug>`, new |
| repo.visibility | private / internal / public | private |
| repo.layout | Monorepo layout | pnpm workspaces: `apps/app`, `apps/api`, `packages/*` |
| repo.default_branch | Default branch | `main` |
| repo.merge | Merge strategy | squash, delete branch on merge |
| repo.protected_branches | Protected branches | `[main]`, required checks, no direct push, linear history |
| repo.codeowners | Human reviewers for high-risk PRs | `[@<owner>]` |
| repo.commit_convention | Commit style | Conventional Commits |
| repo.board | GitHub Project board for the backlog | yes, created by provisioning |

### C — CI/CD
| key | question | default |
|---|---|---|
| ci.provider | CI provider | GitHub Actions |
| ci.runners | Where jobs run | Tests: GitHub-hosted (`ubuntu-latest`; `macos-latest` for iOS). **Publish** (build + push images) and anything needing the internal network: the **ADLC CI runner** (labels `[self-hosted, adlc-publish]`), an ephemeral, sandboxed runner per project on the dev server, enabled by the `ci_admin_pat` secret |
| ci.publish | How images get published | job `publish` on `push` to the default branch only, `runs-on: [self-hosted, adlc-publish]`, `environment: publish`, `docker build --pull` (never trusts cached base images) |
| ci.required_checks | Required for merge | lint, typecheck, arch-check, test, e2e-web, e2e-android, e2e-ios |
| ci.budget | Monthly CI minute/cost limit, especially macOS | `tbd` |

### I — Container registry & images
| key | question | default |
|---|---|---|
| registry.provider | ghcr / harbor / dockerhub / ecr / gar / acr | **ghcr** (same GitHub auth and permissions, no extra account) |
| registry.namespace | Image path prefix | ghcr: `ghcr.io/<owner>/<slug>`; harbor: `<harbor-host>/<harbor-project>/<slug>` |
| registry.reachability | Can GitHub-hosted runners reach it? | ghcr: yes. Internal Harbor: no, so publish runs on the ADLC CI runner |
| registry.tls | Certificate | public CA, or a private CA (then `adlc up <slug> --registry-ca <file>`) |
| registry.credentials | Who pushes, who pulls | **push:** a robot/CI identity stored only in the GitHub Environment `publish` (Harbor: robot account with push on the project); **pull (dev deployer):** a pull-only robot (Harbor) or classic token with `read:packages` (GHCR), set with `adlc secrets` (`registry_token`) and `adlc up --registry <host> --registry-user <user>` |
| registry.images | Images built | `api`, `web` (plus the runner image, which lives in the ADLC repo) |
| registry.tags | Tag scheme | `sha-<short>` on every merge; `vX.Y.Z` on release; never `latest` in deploys |
| registry.retention | Cleanup policy | untagged > 14 days deleted; keep the last 20 sha tags |
| registry.scan | Image vulnerability scan | ghcr: Trivy in CI, fail on critical; harbor: Harbor's built-in scan-on-push + "prevent vulnerable images from running" (critical) |

### E — Environments & deployment
Every environment gets a **profile**. Ask about `dev` and `prod` (and `staging` if wanted). Show one table per environment. The `test` environment (per delivery run) is managed by ADLC and only shown for information.

| key (per env) | question | default dev | default prod |
|---|---|---|---|
| enabled | Use this environment? | yes | yes (staging: no, add later) |
| runtime | docker-compose / docker-swarm / kubernetes / managed (Fly, Render, ECS…) | **docker-compose** | **docker-swarm** |
| hosts | Machines. For swarm: managers/workers | `dev-server` | managers `tbd` (recommend 1 manager + 2 workers to start, 3 managers for HA) |
| url / domains | Public or internal URLs | **ADLC Traefik** (no new infrastructure): `http://app.<slug>.$ADLC_BASE_DOMAIN[:$ADLC_EDGE_PORT]` and `http://api.<slug>.…` (read both env vars in the runner; omit the port when 80). Internal only. Optional HTTPS aliases through the user's own reverse proxy (needed for real phones: iOS/Android block plain HTTP) are an open item | `tbd` |
| deploy.trigger | When it deploys | on merge to main | on release tag |
| deploy.approval | Human approval required | no | **yes** (GitHub Environment `prod`, required reviewer = owner) |
| deploy.mechanism | How the deployment reaches the target | **pull-deployer**: the ADLC runner pulls new images and runs `docker compose up -d` (no inbound access to dev-server needed) | **human-run `adlc-swarm-deploy <owner/repo> <ref>` on the manager** (from the ADLC repo, `sandbox/swarm/`): deploys only commits on the default branch, checks images, runs `deploy/predeploy.sh`, then `docker stack deploy --with-registry-auth`. **Never a self-hosted CI runner on the manager:** any workflow on any branch could target its label |
| ingress | Reverse proxy and TLS | ADLC Traefik (edge + inner): web-facing services join `adlc-web` with Traefik labels; no TLS | Traefik, Let's Encrypt |
| replicas | Per service | 1 each | api 2, web 2 |
| update | Rollout policy | recreate | rolling `start-first`, parallelism 1, healthcheck-gated, `failure_action: rollback` |
| config & secrets | Delivery of config/secrets | env file + Docker secrets | **Swarm secrets/configs** with versioned names (`api_db_password_v3`) |
| data | Postgres / Redis placement | containers with named volumes | Postgres: `tbd` (pinned swarm service with node constraint + volume, or managed DB); Redis: pinned swarm service |
| backups | Schedule, retention, target, restore test | none (re-seedable) | nightly `pg_dump`, 14 days, target `tbd`, monthly restore test |
| migrations | How schema migrations run | on API start | one-off migration job **before** the rolling update; expand/contract only |
| resources | CPU/memory limits | none | per service, set by the architect |
| logs & metrics | Inherits section O | — | — |

Global keys:
| key | question | default |
|---|---|---|
| environments.agent_deploy | Environments ADLC may deploy to without a human | `[dev]` (never prod) |
| environments.parity | Same images promoted across environments | yes: build once in CI, promote by tag, never rebuild for prod |
| environments.test | Per-run test environments | fixed: docker-compose in the project's Docker-in-Docker sidecar, source-mounted, `watch` and `build` modes (see testing-contract) |

Consequences that init records for the architect (in setup.md, "Constraints for architecture"): stateless services, healthchecks on every service, config via env/secrets only, migrations decoupled from app start in prod, no runtime-specific features beyond the chosen runtimes (for example nothing Kubernetes-only when prod is Swarm).

### M — Mobile & web distribution (react-native stack)
| key | question | default |
|---|---|---|
| mobile.ids | iOS bundle id / Android package | `com.<owner>.<slug>` |
| mobile.build | Build service | EAS Build **cloud** (no Mac needed for iOS). Alternatives: `eas build --local` on own runners (Android: ADLC CI runner; iOS: GitHub macOS), or no EAS (prebuild + Gradle/Xcode/fastlane). Build credentials (`EXPO_TOKEN`, keystores) only in a GitHub `release` environment with required reviewer |
| mobile.accounts | Apple Developer team, Google Play account | `tbd` (needed before the first store build) |
| mobile.signing | Credential management | EAS-managed credentials |
| mobile.ota | Over-the-air updates | EAS Update, one channel per environment, prod requires approval |
| mobile.web_hosting | Where the web build is served | same as environments (container `web`) |
| mobile.min_versions | Minimum OS versions | Expo SDK defaults |

### S — Secrets
| key | question | default |
|---|---|---|
| secrets.ci | CI secrets | GitHub Environments secrets (per env) |
| secrets.runtime | Runtime secrets per env | dev: Docker secrets on dev-server; others `tbd` |
| secrets.local | Local development | `.env.example` committed; real `.env` never committed |
| secrets.runner | ADLC runner credentials | Docker secrets: `claude_oauth_token`, `gh_pat` (fine-grained, this repo only, no admin), optional `ci_admin_pat` (Administration only, CI registrar) |
| identity.agents | Who agents act as on GitHub | **the ADLC GitHub App** (`adlc app <slug> --id … --key …`): PRs by `<app>[bot]` that the owner can approve, short-lived tokens, and the bot can't push to protected branches. Fallback `gh_pat` (owner's account): blocking open item before unattended runs |

### V — Versioning, release & dependencies
| key | question | default |
|---|---|---|
| release.versioning | Scheme | SemVer. App store versions derived from it. |
| release.tool | Release automation | release-please (changelog + tags from Conventional Commits) |
| release.cadence | When to cut releases | per milestone, or on demand |
| deps.updates | Dependency updates | Renovate weekly; auto-merge patch/minor for dev deps on green |
| deps.licenses | Licence policy for dependencies | allow MIT/Apache-2.0/BSD/ISC; others need human review |

### O — Observability, notifications & compliance
| key | question | default |
|---|---|---|
| observability.errors | Error tracking | Sentry (app + api) |
| observability.logs / metrics / uptime | Logs, metrics, uptime checks | `tbd` (architect proposes) |
| notifications.channel | Where ADLC reports (blocked, needs-info, high-risk PR, nightly failures) | GitHub notifications, plus a Claude Code push notification for blocked runs |
| notifications.digest | Daily summary | issue comment on a pinned "ADLC status" issue |
| compliance.regimes | GDPR, HIPAA, PCI… | GDPR if EU users |
| compliance.data_residency | Data location | `tbd` |

### A — ADLC runner
| key | question | default |
|---|---|---|
| adlc.runner_host | Where the runner container runs | dev-server |
| autonomy.* | Auto-merge tiers, parallel runs, retries | as in the adlc.yaml template |
| network.mode | Egress mode | audit |

Stack packs may add sections. A pack ships `skills/<pack>-setup/SKILL.md` with extra rows in the same table format. Init asks them after the core sections.

## docs/project/setup.md format
```
# Project setup — <name>
Last updated: YYYY-MM-DD
## Decisions
### <Section> — <key>
Value: …   ·   Default used: yes/no   ·   Decided by: @handle, YYYY-MM-DD
Why: one line
## Open items
| key | needed before | owner |
## Change log
- YYYY-MM-DD <key>: old → new — reason
```

## CLAUDE.md digest format
```
<!-- adlc:setup:begin (generated by /adlc-core:init — do not edit by hand) -->
## Project setup (ADLC)
- Repo: <url> (<visibility>), monorepo <layout>; default branch <b>; squash merges; Conventional Commits
- Images: <registry.namespace>/{api,web}; tags sha-<short>, vX.Y.Z; never deploy `latest`
- Environments: test=per-run compose (watch/build) · dev=<runtime>@<host> (auto on merge) · prod=<runtime> (<hosts>, release tag + approval). Agents may deploy only to: <list>
- Runtime constraints: stateless services, healthchecks, config via env/secrets, prod migrations as a pre-deploy job; deploy files in deploy/ (compose base + per-env overrides, stack.prod.yml for swarm)
- Mobile: <ids>; EAS Build/Update; …
- Secrets: names only; CI=<…>, runtime=<…>. Never write secret values anywhere.
- Release: <tool>, SemVer. Deps: <policy>.
- Open (do not assume): <tbd keys>
- Full record: docs/project/setup.md · values: adlc.yaml
<!-- adlc:setup:end -->
```

## GitHub plan limits (check before proposing gates)
Detect with `gh api user --jq .plan.name` (personal) or `gh api orgs/<org> --jq .plan.name` plus the repo's visibility. For **private** repos:

| Feature | Free | Pro / Team | Enterprise | Public repo (any plan) |
|---|---|---|---|---|
| Branch protection / rulesets (required checks, CODEOWNERS review, no direct push) | ❌ | ✅ | ✅ | ✅ |
| Environment secrets + deployment branch/tag policies | ❌ | ✅ | ✅ | ✅ |
| Environment **required reviewers** / wait timers | ❌ | ❌ | ✅ | ✅ |

Consequences:
- **Free + private:** don't run unattended. Repo-level secrets are readable by any workflow, including agent-written PR workflows, and `main` can't be protected. Recommend Pro/Team (or a public repo if the code may be public) and record it as a blocking open item.
- **Pro/Team + private (common):** gate prod with **`workflow_dispatch` only** (the agents' token has Actions: read, so only humans can trigger it) plus a deployment branch/tag policy (`main`, `v*`) on `prod`/`release`. Don't propose required reviewers. `provision.sh` must not try to create them.
- **Enterprise or public:** required reviewers on `prod`/`release` (default).

## Provisioning rules
- Init never runs privileged actions with the runner's credentials. The runner's PAT intentionally has no admin rights. Init writes `.adlc/provision.sh`, the user reviews it and runs it **on the dev-server host (or their own machine), not inside the runner**, with their own admin `gh` login: `cd <this worktree's host path> && bash .adlc/provision.sh`. Never suggest `! bash …` in a runner or Remote Control session: that runs inside the runner with the agents' token. The host path of the current worktree is the same as `pwd` (the workspace is bind-mounted at an identical path).
- **CI hardening (always):** `CODEOWNERS` with `/.github/ @<owner>`, `/deploy/ @<owner>` and `/adlc.build.yaml @<owner>` plus branch protection "Require review from Code Owners", so GitHub itself makes workflow changes wait for a human, even with auto-merge. A GitHub Environment **`publish`** with deployment branches limited to the default branch, holding the registry push credentials, so workflows on PR branches can't read them. The Environment **`prod`** has required reviewers.
- **Required checks need workflows from day one:** branch protection's required checks must match job names in workflows that the setup PR itself adds (`adlc-core:ci-workflows`: `ci.yml`, the gate, and the stack's `e2e.yml` for each enabled e2e target). Otherwise every PR waits forever for "expected" checks. The workflows skip their work until the walking skeleton sets `adlc.build.yaml status: active`. Set the repository variables `ADLC_TEST_RUNS_ON`, `ADLC_ANDROID_RUNS_ON` and `ADLC_PUBLISH_RUNS_ON` (JSON) from `adlc.yaml ci.runners` (`default`, `android_e2e`, `publish`) with `gh variable set`. `[self-hosted, adlc-kvm]` for Android also needs `adlc up <slug> --ci-kvm on` on the dev server; when unset, test jobs run on `ubuntu-latest`.
- **ADLC CI runner:** print how to create `ci_admin_pat` (fine-grained, this repo only, **Administration: read and write**, nothing else), then `adlc secrets <slug>` + `adlc up <slug>` on the dev server. It is held only by the CI registrar container. Agents and jobs never see it.
- The script is idempotent (check, then create) and prints each action. It covers: repo create/settings, branch protection + required checks, merge settings, labels, milestones, Project board, CODEOWNERS, GHCR package visibility/retention notes, GitHub Environments (+ required reviewers for prod), self-hosted deploy-runner registration instructions for the prod swarm manager (restricted runner group), a checklist of swarm secret names to create on the manager, placeholder secrets (names only, values entered by the user via `gh secret set` prompts), Renovate/Dependabot config, and registration of the project on the dev-server runner (`adlc up <slug>`).
- Anything that needs an external account (Apple, Google Play, Sentry, a DNS provider) becomes a checklist item in setup.md "Open items". It is never automated with guessed credentials.
