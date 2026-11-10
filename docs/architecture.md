# ADLC — Architecture

Status: draft v0.8 · 2026-10-15
Verified against Claude Code 2.1.299 docs (code.claude.com) on 2026-10-14. Items marked **[verify]** still need a hands-on test.

## 1. Decisions

| Topic | Decision |
|---|---|
| Runtime host | `dev-server` running Docker (Linux). Per project: one runner container + one Docker-in-Docker sidecar. Source in a host bind mount `/srv/adlc/projects/<slug>/`. |
| Environments | Defined per project in `/init`. Defaults: **test** = per-run docker-compose (source-mounted, watch/build modes), **dev** = docker-compose on dev-server (pull-deployer, auto on merge), **prod** = **Docker Swarm** (release tag + human approval, rolling updates, Swarm secrets). |
| Work tracking | GitHub Issues + PRs: sub-issues for epics, native "blocked by" dependencies, labels for pipeline state. Requires `gh` ≥ 2.94. |
| Autonomy | Auto-merge low/medium-risk changes on green CI + passing review. High risk (incl. any proposed ADR) waits for a human. |
| First stack | React Native (web, Android, iOS) + Node backend; sidecars Postgres, Redis, Android emulator. |
| Auth | Claude Max. Interactive: `/login` once per container (needed for Remote Control). Unattended: `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`. `ANTHROPIC_API_KEY` must be **unset** in the container (otherwise `-p` bills the API). |
| Engine | MVP: Claude Code CLI for both modes. Phase 2 option: Agent SDK for the poller. Per [support article 15036540](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), SDK and `-p` usage draw from Max subscription limits. |
| Quota overflow | Max includes monthly API credits (from 2026-10-07) covering the SDK, `-p` and the API. Planned `ADLC_OVERFLOW=api-credits`. **[verify]** provisioning. |
| iOS | No simulator on Linux. iOS e2e runs in GitHub CI on macOS runners (`where: ci`). Locally: typecheck + unit only. |
| Discovery | A single interactive product-lead with subagents (no agent team), to save tokens. A product-advisor subagent gives a second opinion each round (`--suggest off|light|bold`). Suggestions enter the PRD only on explicit accept and are logged in `docs/product/suggestions.md`. |
| Architecture review | Independent `architecture-reviewer` subagent by default. `--debate` uses an agent team (interactive only, experimental). |
| Network | Egress proxy, starting in **audit** mode. Credential scoping is the primary control. |
| Agent identity | **ADLC GitHub App** (one per account, installed per repo): installation tokens (1 h, single repo) minted in the runner by `adlc-gh-token`. A `gh` wrapper and git credential helper fetch a fresh token per use. Commits are made as `<app>[bot]`. The bot isn't an admin, so it can't bypass branch protection, and the owner can approve its PRs. `gh_pat` is a fallback only. |
| Prod deploys | Human-run `adlc-swarm-deploy` on the Swarm manager: only refs on the default branch, image check, `deploy/predeploy.sh`, then `docker stack deploy`. No CI runner on the manager. `/deploy/` and `/.github/` are in CODEOWNERS. Works on GitHub Pro (no Enterprise-only environment reviewers or rulesets needed). |
| Stack packs | `stack-react-native`, `stack-react-web`, `stack-node-api` (skills plus templates, runner image layers, egress domain lists), installed by the runner from `adlc.yaml stacks` (README §15). Core `ci-workflows` skill: CI runs the same `adlc.build.yaml` commands as the agents. |
| Project setup | One-time `/adlc-core:init` captures repo, CI, registry (default GHCR), environments, mobile distribution, secrets, release and compliance. Persisted in `adlc.yaml` (policy, read-only for unattended runs), `docs/project/setup.md` (decisions + reasons) and a generated `CLAUDE.md` block (auto-loaded by every agent). Privileged GitHub setup runs through a reviewed `.adlc/provision.sh` with the user's admin credentials. |

## 2. Lifecycle

```
            INTERACTIVE (Remote Control session, you in the loop)                    UNATTENDED (poller + claude -p)
┌──────────┐
│ /init    │ once per project: repo, CI, registry, environments, secrets, release → adlc.yaml, setup.md, CLAUDE.md, provision.sh
└────┬─────┘
     ▼
┌──────────────┐   ┌───────────────┐   ┌────────────────┐               ┌──────────────────────────────────────┐
│ /discover    │──►│ /architect    │──►│ /plan-backlog  │──► GitHub ───►│ /deliver #n  (per ready issue, in    │
│ product-lead │   │ solution-arch │   │ backlog-planner│    issues     │ dependency order, up to N parallel)  │
│ + researcher │   │ + researcher  │   │ (epics, issues,│    + deps     │                                      │
│              │   │ + arch-review │   │  blocked-by)   │               │                                      │
└──────┬───────┘   └──────┬────────┘   └────────────────┘               └──────────────────────────────────────┘
       ▼                  ▼                                                     ▲         │ needs-info / blocked /
 docs/product/     docs/architecture/  (ADRs, quality attributes,               │         │ high-risk PR
 vision, prd,      evolution, fitness functions, adlc.yaml)                     └─────────┘ ← you, via issue comments
 glossary                                                                                    or a Remote Control session
```

Existing projects: `/init` (to record setup facts), then `/architect --assess` reconstructs the as-is architecture. `/discover` works on a feature idea as well as on a whole product.

## 3. Runtime modes

| Mode | Mechanism | Used for |
|---|---|---|
| **Interactive** | `claude remote-control --spawn worktree` in tmux inside the runner, attached from laptop/phone/claude.ai. Over SSH: `adlc session <slug> [name]` starts `claude --remote-control` in its own worktree in the runner's tmux (survives disconnects, same conversation also reachable remotely). `--run <n> --takeover` stops an unattended run and continues it interactively. | `/discover`, `/architect`, `/plan-backlog`, answering `needs-info`, supervised `/deliver`, debugging. Agent teams available. |
| **Unattended** | Poller (bash + `gh`) → `claude -p "/adlc-core:deliver <n>" --permission-mode bypassPermissions --output-format stream-json` | Delivering `adlc:ready` issues without anyone attached |

**Why `-p` for unattended:** Remote Control is a remote screen and keyboard. Nothing in it reacts to a GitHub label. `-p` is a normal process with an exit code and structured output, so the poller can supervise, retry and back off. Losing agent teams costs nothing here: delivery is hub-and-spoke with file handoffs, and teams would multiply token use (each teammate is a full long-lived session).

### Poller responsibilities
1. **Promotion:** for each `adlc:queued` issue, if every blocked-by issue is closed (`gh issue view --json` dependency fields; REST `issues/{n}/dependencies/blocked_by` as fallback), relabel it `adlc:ready`.
2. **Pick:** the oldest `adlc:ready` issue by milestone, then backlog order. **Trust:** only issues authored by collaborators.
3. **Run:** at most `ADLC_MAX_PARALLEL_RUNS` (default 1, since one Max quota is shared). On a rate-limit failure: back off exponentially and relabel `adlc:ready`.
4. **Health:** pause itself if the `system/init` event reports `plugin_errors` **[verify]** field name. Log an error when GitHub rejects the token.
5. **Recovery:** on start, issues left `adlc:in-progress` without a live process go back to `adlc:ready` (they resume from `state.json` and the last pushed phase). A run that ends without a terminal label is commented on and set to `adlc:blocked`.
6. **Cleanup:** when the issue is closed, the run's worktree, local branches and compose environment are removed. Logs are kept 7 days.

Nightly full e2e is **not** a poller job. It's a scheduled GitHub Actions workflow created by the walking skeleton, deterministic and free of agent tokens, which opens `adlc:regression` issues on failure.

Alternative kept for Phase 2: a self-hosted GitHub Actions runner on dev-server with `anthropics/claude-code-action@v1` and an `issues: labeled` trigger.

## 4. Workspace & runtime topology

### Where the code lives
GitHub is the source of truth. The dev server holds a disposable working copy on a **host bind mount**, never inside a container's own filesystem: it survives runner upgrades, is inspectable from the host, and the test containers need to mount it too.

```
/srv/adlc/
├── projects/<slug>/                 bind-mounted into runner AND docker sidecar at the same path
│   ├── repo/                        shared clone (stays on main; fetched before every run)
│   ├── runs/<n>/                    git worktree per delivery run, branch adlc/<n>-<slug>
│   │   └── …implementer worktrees   one per parallel task (adlc/<n>-t<k>)   [verify] exact location
│   └── sessions/                    worktrees for interactive Remote Control sessions (--spawn worktree)
└── cache/                           pnpm store, Gradle cache (shared, hard-linked)
```
Run lifecycle: fetch → `git worktree add runs/<n>` → agents work only there → **push after every phase** → PR merged on GitHub → poller prunes the worktree. Logs and traces are kept 7 days. The dev server never holds unique work.

### Containers per project
```
adlc-<slug>-runner   claude, gh, git, tmux; Remote Control + poller + pull-deployer; non-root (uid = host folder owner)
adlc-<slug>-docker   Docker engine (DinD) with /dev/kvm; runs all test environments and the dev environment
  ├── run-<n>        postgres, redis, api, web/metro, emulator: own network, own ports, own DB
  ├── dev            the long-lived dev environment (compose, images from the registry)
  └── traefik (inner) routes <n>.app.<slug>.<base> / <n>.api… / app.<slug>.<base> to labelled containers on network adlc-web
edge traefik (one per host) → *.<slug>.<base> → adlc-<slug>-docker:80   (base defaults to <host-ip>.nip.io)
```
The runner never gets the host's Docker socket (that would be root on the dev server). Sysbox is a later hardening option.

### CI runner (optional, per project, when `ci_admin_pat` is set)
```
adlc-<slug>-ci         registrar: holds ci_admin_pat (repo Administration: write), creates JIT runner configs,
                       starts one ephemeral runner at a time, resets ci-docker between jobs; runs no job code
adlc-<slug>-ci-docker  separate Docker engine (DinD) on its own internal network "ci". Unreachable from the
                       agents' runner, so agents can't exec into a running publish job and read its secrets
  └── adlc-<slug>-<ts> ghcr.io/actions/actions-runner, --jitconfig, labels self-hosted,linux,adlc-publish
```
Threat model: agents have Workflows: write, and PR workflows run the PR branch's definition, so agent-written job code can land on this runner before review. Controls:
1. **Isolation:** ephemeral container, separate engine, egress proxy, no host access.
2. **No persistence:** each job gets a fresh runner, and leftovers are removed before the next one. Publish builds use `--pull`.
3. **Secrets scoped to `main`:** the `publish` environment has a deployment-branch policy.
4. **Human review of `.github/`:** enforced by GitHub through CODEOWNERS.

The registry pull credential (dev deployer) sits in the agents' runner. It's read-only by design.

### Environments
| Env | Runtime | Built from | Deploys | Who |
|---|---|---|---|---|
| **test** (per run) | docker-compose in the DinD sidecar | the run's **source folder** (no registry) | `watch`: hot reload (API watcher, Metro Fast Refresh, Android debug build reading JS from Metro; native rebuild only on fingerprint change). `build`: prod-like build for gating e2e | agents |
| **dev** | docker-compose on dev-server | registry images (`sha-…`) built by CI after merge | pull-deployer in the runner: new image on main → `docker compose pull && up -d` | automatic (`agent_deploy: [dev]`) |
| **staging** | optional, same as prod runtime | promoted images | release tag | automatic or approval |
| **prod** | **Docker Swarm** (default) | the same images, promoted by tag | GitHub Actions in the `prod` Environment (required reviewer) on a self-hosted runner on a swarm manager: migration job → `docker stack deploy --with-registry-auth` with start-first rolling update and auto-rollback | **human approval** |

Deploy files (`deploy/`): `compose.yml` (base: services, images, healthchecks) plus overrides `compose.test.yml`, `compose.dev.yml`, `stack.prod.yml` (Swarm `deploy:` keys: replicas, update_config, placement, secrets). Images are built once and promoted, never rebuilt per environment. The runtimes are setup facts. The solution architect designs for them (stateless services, healthchecks, secrets/configs, migrations decoupled from start), and the backlog contains a walking skeleton that deploys to dev plus a production-pipeline issue before the first release.

## 5. Components

```
adlc/  (this repo = Claude Code plugin marketplace)
├── .claude-plugin/marketplace.json
├── plugins/
│   ├── adlc-core/
│   │   ├── commands/   init, discover, architect, plan-backlog, deliver
│   │   ├── agents/     (see §6)
│   │   ├── skills/     handoff-contracts, testing-contract, project-setup
│   │   └── hooks/      guard.sh (PreToolUse)
│   ├── stack-react-native/   (Phase 4) skills, e2e patterns, emulator sidecar, network domains
│   ├── stack-react-web/      skills (Vite SPA, nginx image, Vitest/Playwright), templates
│   └── stack-node-api/       (Phase 4) skills, Postgres/Redis patterns, network domains
├── sandbox/            (Phase 0, next) Dockerfile, compose, egress proxy, entrypoint, poller
├── templates/project/  .claude/settings.json, CLAUDE.md, adlc.yaml (policy), adlc.build.yaml (commands)
└── docs/
```

### Installation path (no manual steps)
1. **Runner start:** the entrypoint registers the ADLC checkout (mounted read-only at `/opt/adlc`) as the `adlc` marketplace and installs or updates `adlc-core`. The plugins persist in the runner's home volume. Updating ADLC means `git pull` on the host, then `adlc up <slug>`.
2. **Project settings** declare `extraKnownMarketplaces` + `enabledPlugins` for humans working locally (loaded after the folder is trusted).
3. Headless runs set `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1`.

## 6. Project-level architecture governance

| Role | Scope | Mode | Binds |
|---|---|---|---|
| solution-architect (`/architect`) | System, now + 1-3 years | Interactive | Writes accepted ADRs, quality attributes, evolution seams/triggers, fitness functions |
| feature-architect (in `/deliver`) | One issue | Unattended | Works within accepted ADRs. A deviation → writes a **proposed** ADR, risk = high, human approves it with the PR |
| code-reviewer | One diff | Unattended | A deviation without a proposed ADR is blocking |
| build-runner | Every verify | Unattended | Runs `arch_check` (fitness functions), which is blocking |

Future needs are handled through quality attributes tagged **now / later / speculative**. Only *now* is built. *Later* gets a seam plus a measurable trigger in `evolution.md`. *Speculative* is written down and deliberately not designed for. The architecture-reviewer flags both over-engineering and missing seams.

## 7. Project setup and configuration files

`/adlc-core:init` runs once per project, before discovery. The `project-setup` skill holds the question catalogue with recommended defaults, and stack packs can add sections (for example mobile distribution). It separates **setup facts** (where things live, who owns them, what is allowed) from **technical design**, which belongs to `/architect`.

| File | Contents | Written by | Unattended runs |
|---|---|---|---|
| `adlc.yaml` | Policy: project, repo, ci, registry, environments, mobile, secrets (names only), release, deps, observability, notifications, compliance, stacks, platforms, autonomy, network | `/init`, `/architect` (stacks) | **read-only** (guard hook, `ADLC_MODE=unattended`) |
| `adlc.build.yaml` | commands, env lifecycle, testing targets | `/architect` (draft), walking skeleton | editable; counts as an infra change → risk high |
| `docs/project/setup.md` | Each decision with value, reason, date, owner; open items; change log | `/init` | read-only |
| `CLAUDE.md` (generated block) | ≤ 30-line digest of the setup facts | `/init` | read-only |
| `.adlc/provision.sh` | Idempotent privileged setup: repo, branch protection, labels, milestones, board, environments, secret names, Renovate, runner registration | `/init`; **run by the human** with admin `gh` auth | n/a |

Why the policy file is read-only for agents: an unattended agent must not be able to raise its own autonomy, widen network access, or change where things deploy. `tbd` values are never assumed. An agent that needs one blocks and names the key, and the human resolves it with `/adlc-core:init --update <section>`.

## 8. Agent roster and model routing

| Agent | Model | Effort | Used in | Writes |
|---|---|---|---|---|
| *product lead* (main session) | session model (Opus recommended) | — | /discover | `docs/product/*` |
| *solution architect* (main session) | session model (Opus recommended) | — | /architect | `docs/architecture/*` |
| *delivery planner* (main session) | session model | — | /plan-backlog | GitHub issues |
| *setup lead* (main session) | session model | — | /init | adlc.yaml, setup.md, CLAUDE.md block, provision.sh |
| *delivery lead* (main session) | session model | — | /deliver | `state.json` |
| researcher | sonnet | medium | discover, architect | research notes |
| product-advisor | opus | medium | discover (once per round + final pass) | ranked suggestions (reply only); logged in `suggestions.md` |
| architecture-reviewer | opus | xhigh | architect | `review-<date>.md` |
| backlog-planner | opus | high | plan-backlog | `.adlc/backlog.md` |
| codebase-scout | haiku | low | all | `context-map.md` |
| requirements-analyst | opus | high | deliver | `spec.md` |
| feature-architect | opus | high | deliver | `design.md`, tasks, proposed ADRs |
| test-designer | sonnet | medium | deliver | tests |
| implementer | sonnet | medium | deliver (`isolation: worktree`) | code on a task branch |
| build-runner | haiku | low | deliver | `verify-*.md` |
| debugger | sonnet → opus on last attempt | high | deliver | fixes |
| qa-engineer | sonnet | medium | deliver | e2e flows, `qa-*.md` |
| code-reviewer | sonnet (opus if risk = high) | high | deliver | `review.md` |
| security-reviewer | sonnet | medium | deliver | `security.md` |
| release-manager | haiku | low | deliver | PR |

For unattended runs the poller starts `claude -p --model sonnet`. The lead only orchestrates, and every decision-heavy step is already routed to Opus subagents. **[verify]** quality vs. `--model opus` for the lead during the smoke tests.

### Token-efficiency rules
1. Main sessions never read source or logs. They see ≤15-line status blocks.
2. Haiku reads and summarises, Sonnet writes code, Opus decides. Escalate to a stronger model on a retry before giving up.
3. Every agent gets the smallest toolset it needs. Nesting is disabled (no `Agent` tool in subagents).
4. Deterministic checks (lint, typecheck, architecture checks, tests) are commands. Models reason only about the failures.
5. Shared formats live in skills, which keeps prompts small and stable and helps prompt caching.
6. Retry budgets: build 3, QA 2, review 2. Then `adlc:blocked`.
7. Expensive steps are gated by relevance: security review by risk or area, QA by e2e ACs or UI changes, exploratory QA with a capped tool budget, full e2e nightly only.

## 9. Testing

The core defines when tests run and what counts as passing (`testing-contract` skill). Stack packs define how. `adlc.build.yaml` supplies the commands.

- **Per-run environment:** `docker compose -p adlc-<n>` in the DinD sidecar gives each run fresh Postgres/Redis, deterministic seed data, and mocked third-party APIs, built from source. `watch` mode for development and exploration, `build` mode (prod-like) for gating e2e (see §4).
- **Targets:** web via Playwright (parallel). Android via Maestro + emulator sidecar (needs `/dev/kvm`, exclusive via `flock`). iOS via Maestro on a GitHub macOS runner (`where: ci`).
- **Per run:** smoke + affected flows. **Nightly:** full suite on the default branch, with failures turned into issues. **Merge gate:** GitHub required checks.
- **Flaky:** retry once. Pass on retry → quarantined plus a follow-up issue. Never deleted.

## 10. Security & network

**Threat model:** unattended runs combine valuable credentials, untrusted input (issue text, package READMEs, web pages) and autonomy. Prompt injection plus open egress could leak the credentials.

Controls, strongest first:
1. **Credential scoping:** a fine-grained GitHub PAT on the project repo only (issues, PRs, contents, no admin). No production credentials in the runner, ever. The Claude OAuth token and PAT are Docker secrets.
2. **Trusted input only:** the poller and `/deliver` ignore issues and comments from non-collaborators.
3. **Guard hooks:** no force-push, no pushes to protected branches, no direct merges (only `--auto`), no repo administration, no secret-file reads.
4. **GitHub branch protection:** required checks, no direct pushes.
5. **Egress proxy** (all HTTP(S) leaves through it) with `network.mode`:
   - `open`: interactive sessions (a human is present).
   - `audit`: allow and log every domain. This is the **initial default** for all modes, run for a few weeks.
   - `allowlist`: unattended runs once the list is stable. The list is assembled from core (Anthropic, GitHub, Context7) + each enabled stack's `sandbox/egress/domains/<stack>.txt` + `adlc.yaml network.extra_domains`.
6. **Package caches** inside the runner (npm/pnpm store, Gradle) to reduce outbound traffic and speed up builds.
7. Non-root container user (required for `bypassPermissions`).
8. The poller sets `ADLC_MODE=unattended`, so the guard hook makes the policy and setup files read-only for agents.

## 11. Known constraints / gotchas
- **Traefik ≥ 3.6** is required with Docker Engine 29. Older releases use Docker API 1.24 and the docker provider fails.
- **Proxy injection:** the runner's Docker client injects `HTTP(S)_PROXY` into every container and build. Runtime services must set `NO_PROXY: "*"`, otherwise service-to-service calls by name are sent to the proxy and refused (403). This is in the testing contract.
- **Single-file bind mounts** of files that don't exist yet make Docker create a directory. Mount directories.
- `CLAUDE_CODE_OAUTH_TOKEN` is exported **only** for `claude -p` runs. Remote Control needs the `/login` session, and the token would take precedence.
- GHCR pulls need a classic PAT (`read:packages`), hence the separate `registry_token` secret. **[verify]** fine-grained PAT support for packages.
- The react-native stack layer is x86_64-only (Android platform-tools).
- Squid rejects allowlists where one entry is covered by another. The egress entrypoint drops covered entries and validates the config before activating it (keeping the previous one on error).
- Personal GitHub accounts only have repo-level self-hosted runners: one CI registrar per project. Org-level runner groups would allow sharing.
- `isolation: worktree` branches from the **default branch**. Implementers `git switch -c <task-branch> <feature-branch>` first.
- Plugin subagents ignore `hooks`, `mcpServers`, `permissionMode` frontmatter. Guards live in `hooks/hooks.json`. The permission mode comes from the CLI flag.
- Agent teams: experimental, interactive only, not under `-p`.
- Remote Control is unavailable with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` set or with API-key auth. Server mode exits after ~10 min of connection failure, so it needs a restart loop.
- `${CLAUDE_PLUGIN_ROOT}` is not exported to Bash. Use it only in hook/MCP config and agent/skill Markdown.
- GitHub issue types are org-level. Personal repos fall back to the `type:epic` label.

## 12. Roadmap
| Phase | Deliverable | Status |
|---|---|---|
| 0 | Plugin skeleton, agents, commands (init/discover/architect/plan-backlog/deliver), contracts, guard hook | **done (draft)** |
| 0 | `sandbox/` (runner image, DinD sidecar, edge + inner Traefik, egress proxy, Remote Control supervisor, poller, pull-deployer), `bin/adlc` | **done.** Integration-tested on Docker Desktop: startup, plugins + skill preload, DinD over TLS, egress audit/allowlist enforcement (runner and nested containers), preview routing. Not yet on a Linux host; no real GitHub/Claude run yet. |
| 1 | Smoke test: toy RN + Node repo, discover → architect → backlog → deliver 3 issues | |
| 2 | Hardening: rate-limit handling, resume, telemetry (tokens/cost per agent), optional Agent SDK poller | |
| 3 | Nightly regression workflow template, flaky management, docs agent, notifications/digest | |
| 4 | Stack packs: react-native, node-api, react-web | **done.** Skills, templates, runner layers and egress lists; exercised by a real project's walking skeleton and deliveries since October 2026. |
| 4b | Agent identity (GitHub App), human-run Swarm deploys | **done (draft).** JWT signing and the error paths tested; deploy script tested in a throwaway swarm. Real app install pending. |
| 4c | Pack-authoring guide; more packs (ESP32 …) | |
| 5 | Evals per agent (golden issues), routing tuned from telemetry | |
