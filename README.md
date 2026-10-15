# ADLC: Agentic Delivery Life Cycle

ADLC is a software delivery pipeline built on [Claude Code](https://code.claude.com). You describe what you want. ADLC helps you shape it into a product spec and an architecture, breaks it into GitHub issues, and then delivers those issues one by one as tested, reviewed pull requests, largely unattended.

It is packaged as a Claude Code **plugin marketplace**, so a project gets the whole pipeline (agents, commands, skills, guardrails) from git. Nothing is installed by hand.

> **Status:** draft v0.6. The plugin (agents, commands, contracts, guard hook) and the **runner sandbox** (`sandbox/`, `bin/adlc`) are built. The sandbox was integration-tested on Docker Desktop (macOS); the first run on a Linux dev server and the first real end-to-end delivery are still to come. Features not built yet are marked 🚧. See [docs/architecture.md](docs/architecture.md) for the full design.

---

## Contents
1. [How it works](#1-how-it-works)
2. [Key concepts](#2-key-concepts)
3. [Installation](#3-installation)
4. [Starting a new project](#4-starting-a-new-project)
5. [Adopting ADLC on an existing project](#5-adopting-adlc-on-an-existing-project)
6. [Defining requirements (PRD)](#6-defining-requirements-prd)
7. [Defining the architecture](#7-defining-the-architecture)
8. [Planning the backlog](#8-planning-the-backlog)
9. [Delivery: from issue to merged PR](#9-delivery-from-issue-to-merged-pr)
10. [Day-to-day operation](#10-day-to-day-operation)
11. [Evolving the project](#11-evolving-the-project)
12. [Configuration reference](#12-configuration-reference)
13. [Agents and models](#13-agents-and-models)
14. [Safety model](#14-safety-model)
15. [Extending ADLC with stack packs](#15-extending-adlc-with-stack-packs)
16. [Troubleshooting](#16-troubleshooting)
17. [Repository layout](#17-repository-layout)

---

## 1. How it works

```
 YOU + CLAUDE (interactive)                                          AGENTS (unattended)
 ─────────────────────────────────────────────────────────           ────────────────────────────────
 /adlc-core:init          once: repo, CI, registry, environments
        │
 /adlc-core:discover      idea ──► vision, PRD, acceptance criteria
        │
 /adlc-core:architect     PRD ──► architecture, ADRs, quality targets
        │
 /adlc-core:plan-backlog  PRD + architecture ──► GitHub epics + issues (with dependencies)
        │
        └──────────────► GitHub issues labelled adlc:ready ───────►  /adlc-core:deliver <n>
                                                                      spec → design → tests → code
                                                                      → verify → e2e → review → PR
                                                                              │
         you: answer questions, approve high-risk PRs  ◄──────────────────────┘
```

- **The four planning steps are conversations.** You work with Claude, usually through a Remote Control session on the dev server that you reach from your laptop, phone or claude.ai. Claude proposes and you decide.
- **Delivery runs without you.** A poller on the dev server picks up ready issues in dependency order and runs the delivery pipeline. Low- and medium-risk changes merge automatically once CI is green. High-risk changes wait for you.

---

## 2. Key concepts

| Concept | Meaning |
|---|---|
| **Interactive mode** | A Claude Code session you drive (`/init`, `/discover`, `/architect`, `/plan-backlog`, or a supervised `/deliver`). Runs on the dev server under Remote Control, or locally. |
| **Unattended mode** | The poller runs `claude -p "/adlc-core:deliver <n>"` for each ready issue. Nobody is attached. |
| **Project documents** | `docs/product/` (what to build), `docs/architecture/` (how), `docs/project/setup.md` (where it lives, setup decisions). Versioned in the repo. |
| **ADR** | Architecture Decision Record (`docs/architecture/adr/NNNN-*.md`). *Accepted* ADRs are binding on all agents. |
| **Run directory** | `.adlc/runs/<issue>/`: spec, design, tasks and reports for one delivery. It travels with the PR as evidence. |
| **Risk tier** | `low` / `medium` / `high`, set per issue by the feature-architect. It decides how deep the review goes and whether the PR auto-merges. |
| **Labels** | GitHub labels drive the pipeline state (see [§9](#9-delivery-from-issue-to-merged-pr)). |
| **`tbd`** | An undecided setup value. Agents never assume it. They stop and ask. |

---

## 3. Installation

### Prerequisites
- A Claude subscription (Max recommended) or Team/Enterprise plan.
- GitHub account/org. `gh` CLI **≥ 2.94** (sub-issues and issue dependencies).
- For the runner: a Linux host (x86_64) with Docker Engine + Compose v2, 50 GB+ free disk, and `/dev/kvm` for the Android emulator. [Sysbox](https://github.com/nestybox/sysbox) is recommended (hardened Docker-in-Docker).

### Option A: on the dev server (recommended)
```bash
# once per dev server
git clone https://github.com/kororos/adlc.git ~/adlc && cd ~/adlc
sudo mkdir -p /srv/adlc && sudo chown "$USER": /srv/adlc
./bin/adlc doctor

# once per project
./bin/adlc secrets myapp                       # prompted, stored in /srv/adlc/secrets/myapp (mode 600)
./bin/adlc up myapp --repo myorg/myapp          # builds the runner and starts runner + Docker sidecar + egress proxy
./bin/adlc login myapp                          # one-time: /login with your Claude account, trust the folder, /exit
./bin/adlc attach myapp                         # answer the one-time "Enable Remote Control?" prompt, then Ctrl-b d
```
Then open **claude.ai/code** or the Claude app and pick the session **`adlc-myapp`**. You're now driving Claude on the dev server.

**Secrets** asked by `adlc secrets`:
| Name | What | Used for |
|---|---|---|
| `gh_pat` | **Fine-grained** token, **this repo only**. Read/write: Contents, Issues, Pull requests, **Workflows**. Read: Actions, Commit statuses, Metadata. Nothing else (no Administration, Secrets, Environments). | everything agents do on GitHub |
| `claude_oauth_token` | Output of `claude setup-token` (one-year token, uses your subscription). One line, starting with `sk-ant-oat` | unattended `claude -p` runs |
| `ci_admin_pat` | **Fine-grained**, this repo only, **Administration: read and write**, nothing else. Optional: empty = no CI runner | registering ephemeral CI runners. Held only by the CI registrar, never by agents or jobs |
| `registry_token` | Pull-only credential: Harbor robot secret (pull), or a classic token with `read:packages` for GHCR. Optional until CI publishes images | the dev deployer pulling images |

Run `adlc up <slug>` again after pulling a new ADLC version or changing secrets. It's idempotent.

### Bootstrapping a brand-new project
Fine-grained tokens are scoped to existing repos, so create the (empty) repo first, as yourself:
```bash
gh repo create kororos/<slug> --private --add-readme     # your own gh login on the host
# create gh_pat (and ci_admin_pat) for kororos/<slug> on github.com, see the table above
adlc secrets <slug> && adlc up <slug> --repo kororos/<slug>
adlc login <slug> && adlc attach <slug>                   # one-time login + "Enable Remote Control? y"
adlc session <slug>                                       # → /adlc-core:init
cd /srv/adlc/projects/<slug>/sessions/main && bash .adlc/provision.sh   # on the host, with YOUR gh login (admin)
```

### CI runner (self-hosted, sandboxed)
Tests run on GitHub-hosted runners. Jobs that need your network, such as **publishing images to an internal registry**, run on the **ADLC CI runner**: `runs-on: [self-hosted, adlc-publish]`. It's enabled per project by setting `ci_admin_pat`:
- A **registrar** container holds `ci_admin_pat` and starts **one single-use (JIT) runner at a time**. It never runs workflow code.
- Jobs run in a **separate Docker engine** (`ci-docker`) that agents can't reach, behind the same egress proxy. Before each new job, everything the previous job left behind is removed.
- Because agents can edit workflows, two GitHub-side rules (set by `provision.sh`) complete the picture: `.github/` changes need **your review** (CODEOWNERS + "Require review from Code Owners"), and registry **push credentials live in the `publish` environment, limited to `main`**, so PR-branch workflows can't read them.

`adlc logs <slug> ci` shows the registrar. Runners appear under the repo's Settings → Actions → Runners while waiting for a job.

### Using Harbor (or another private registry)
```bash
adlc up <slug> --registry harbor.example.com \
               --registry-user 'robot$<project>+adlc-pull' \
               [--registry-ca /path/to/internal-ca.crt]          # only for a private CA
adlc secrets <slug>                                              # registry_token = the pull robot's secret
```
In Harbor, create two robot accounts on the project: **pull-only** (for the dev server, as above) and **push** (stored as secrets in the GitHub `publish` environment, used by the publish job). In `/adlc-core:init` choose registry `harbor`, set the namespace `<host>/<project>/<slug>`, and add the Harbor host to `network.extra_domains`. Publishing runs on the ADLC CI runner, since GitHub-hosted runners can't reach an internal Harbor.

### Hardening with Sysbox (recommended)
Without [Sysbox](https://github.com/nestybox/sysbox), the per-project Docker engines run as **privileged** containers. That isolates test environments from the host's Docker, but it isn't a strong security boundary. To harden:
1. Stop running containers (the installer restarts Docker), install the `sysbox-ce` package for your distro from the Sysbox releases page, and check that `docker info | grep -i sysbox` shows `sysbox-runc`. Check the release notes for supported Docker Engine versions first.
2. New projects use it automatically. For existing ones: `adlc up <slug> --dind sysbox`. This also applies to the CI engine.

### Working in a terminal over SSH
```bash
ssh dev-server
cd ~/adlc
./bin/adlc session myapp                # Claude Code in your terminal, worktree sessions/main
./bin/adlc session myapp feature-login  # a second, independent session (own worktree and branch)
```
- The session runs **inside the runner's tmux**, so it survives SSH disconnects. Detach with `Ctrl-b d`. Running the same command again re-attaches, and `Ctrl-b w` lists all sessions.
- It is started with Remote Control enabled (name `adlc-<slug>-<name>`), so you can continue **the same conversation** from claude.ai/code or the Claude app.
- Each session works in its own git worktree (`sessions/<name>`, branch `adlc/session-<name>`). Never work in the shared clone `repo/`: the poller resets it to `origin/main` every minute.
- Run the pipeline commands there as usual: `/adlc-core:discover`, `/adlc-core:deliver 42`, …

**Watching or taking over an unattended run:**
```bash
./bin/adlc logs myapp run 42                      # follow what the agents are doing (read-only)
./bin/adlc session myapp --run 42 --takeover      # stop the unattended run and open Claude in its worktree
#   then, in Claude:  /adlc-core:deliver 42      → resumes from the last completed phase
```

### Operating the runner
| Command | Does |
|---|---|
| `adlc status [slug]` | containers, active runs, paused/backoff state, dev version, login state |
| `adlc session <slug> [name]` | **interactive Claude session in your SSH terminal**, in its own worktree, also reachable from claude.ai/app (see below) |
| `adlc session <slug> --run <n> [--takeover]` | session inside delivery run #n's worktree; `--takeover` stops the unattended run so you can continue it |
| `adlc shell <slug>` | bash inside the runner, with `gh` authenticated |
| `adlc attach <slug>` | tmux with windows **rc** (Remote Control), **poller**, **deployer**, **shell** and your sessions (detach: Ctrl-b d) |
| `adlc pause` / `resume <slug>` | stop/start launching new runs (running ones finish) |
| `adlc logs <slug> [poller\|deployer\|rc\|egress\|ci\|run <n>]` | follow logs. `run <n>` shows the agent's narrative and cost for the latest run of issue n |
| `adlc audit <slug>` | domains reached through the egress proxy and whether each is allowlisted |
| `adlc down <slug>` | stop the project (workspace, volumes and login are kept) |
| `adlc doctor` | host checks |

### Option B: locally, in any Claude Code session
```text
/plugin marketplace add https://github.com/kororos/adlc.git
/plugin install adlc-core@adlc
```
Projects created by `/adlc-core:init` also contain a `.claude/settings.json` that registers the marketplace. Anyone who clones the project and trusts the folder gets the plugins automatically.

> Use **Opus** as the session model for `/init`, `/discover`, `/architect` and `/plan-backlog`. Those roles run in your main session, and their quality sets the ceiling for everything downstream.

---

## 4. Starting a new project

All commands below run in an interactive Claude Code session, in an empty folder or a fresh clone.

### Step 1: Project setup (`/adlc-core:init`), about 15 minutes, once
```text
/adlc-core:init
```
Claude asks for the project name, description and platforms. Then it goes section by section. Each section shows the proposed values with a one-line reason; you confirm, change, or answer `tbd`:

| Section | Examples of what is decided |
|---|---|
| Project | name, slug, owner, licence |
| Source control | GitHub repo, visibility, monorepo layout, protected branches, squash merges, CODEOWNERS |
| CI/CD | GitHub Actions, macOS runner for iOS, required checks, CI budget |
| Container registry | GHCR (default), image names, tag scheme, retention, vulnerability scanning |
| Environments | a profile per environment: **runtime** (default: dev = Docker Compose on the dev server, prod = **Docker Swarm**), hosts/nodes, URLs, deploy trigger and approval, ingress/TLS, replicas, rolling-update policy, secrets, database placement and backups, how migrations run, **where agents may deploy on their own** (default: dev only) |
| Mobile | bundle IDs, Expo EAS build/update, store accounts, signing |
| Secrets | where secrets live (names only, never values) |
| Release & deps | SemVer, release-please, Renovate, allowed licences |
| Operations | error tracking, logging, notifications, compliance (GDPR, data residency) |
| ADLC | autonomy (which risk tiers auto-merge), network mode |

Tip: choose **"accept all defaults and review only the summary"** to finish in a few minutes, then refine later with `--update`.

**Result:**
- `adlc.yaml`: the setup values (the source of truth).
- `docs/project/setup.md`: every decision with its reason, plus a list of open `tbd` items and when each is needed.
- A generated block in `CLAUDE.md`, so every agent always sees the essentials.
- `.adlc/provision.sh`: a script that creates and configures the GitHub repo (branch protection, labels, milestones, project board, environments, secret placeholders) and registers the project on the runner.

**Then run the provisioning script yourself**, with your own GitHub admin login. The agents' token deliberately has no admin rights.
```text
! bash .adlc/provision.sh
```
It is idempotent, so you can re-run it safely. It will prompt you for secret values. Those never pass through Claude.

### Step 2: Discovery (`/adlc-core:discover`)
Turn your idea into a product definition. See [§6](#6-defining-requirements-prd).
```text
/adlc-core:discover A booking app for small gyms: members book classes on mobile, gym owners manage schedules on web…
```

### Step 3: Architecture (`/adlc-core:architect`)
Design the system for today's needs with room for tomorrow's. See [§7](#7-defining-the-architecture).
```text
/adlc-core:architect
```

### Step 4: Backlog (`/adlc-core:plan-backlog`)
Break the work into ordered GitHub issues. See [§8](#8-planning-the-backlog).
```text
/adlc-core:plan-backlog
```

### Step 5: Let it deliver
The first issue is always the **walking skeleton**: repo scaffold, CI, test environment, and one thin end-to-end path (screen → API → database). Once it merges, everything else builds on it. From here the poller delivers issues in dependency order, or you start one yourself:
```text
/adlc-core:deliver 1
```

Each planning step ends with a PR containing its documents. Discovery and backlog PRs auto-merge. Setup and architecture PRs wait for you to merge them.

---

## 5. Adopting ADLC on an existing project

1. **Install** the plugins (see [§3](#3-installation)) and open the project.
2. **Record the setup:** `/adlc-core:init`. Claude detects what already exists (repo, CI, registry) and proposes those values instead of defaults. Run `provision.sh` to add the ADLC labels, environments and branch protection.
3. **Reconstruct the architecture:** `/adlc-core:architect --assess`. The codebase-scout maps the code and the solution-architect writes the *as-is* architecture, retroactive ADRs, and a **Risks & debt** list. Review it carefully: from now on these ADRs constrain every change.
4. **Write the build profile:** `--assess` drafts `adlc.build.yaml` from your existing scripts (install, lint, typecheck, test, e2e). Check that each command actually works.
5. **Bring in work:**
   - For a **new feature**: `/adlc-core:discover <feature idea>`, then `/adlc-core:plan-backlog`.
   - For **existing issues**: make sure they follow the [issue format](#writing-issues-by-hand), then label them `adlc:ready`.
6. Start with one or two **low-risk issues** delivered under supervision (`/adlc-core:deliver <n>` in an interactive session) before enabling the poller.

---

## 6. Defining requirements (PRD)

```text
/adlc-core:discover <idea text | path/to/brief.md>
/adlc-core:discover --resume
```

The **product lead** works through six rounds. In each round it proposes a concrete draft for you to react to, and asks at most 3–4 questions, each with a suggested answer:

| Round | Outcome |
|---|---|
| 1. Problem & users | who has the problem, how success is measured, non-goals |
| 2. Journeys | 3–7 core user journeys, step by step |
| 3. Features & scope | features `F1…Fn`, MoSCoW priority, **the MVP line** |
| 4. Acceptance criteria | Given/When/Then for every Must feature |
| 5. Non-functional | platforms, offline, auth/roles, privacy, scale over 1–3 years, integrations |
| 6. Risks & open questions | assumptions to validate, deferred items |

After every round the documents are updated and committed, so you can stop at any time and `--resume` later.

**Claude also suggests enhancements.** After drafting each round, a **product-advisor** agent (Opus, fresh perspective) reviews the PRD so far and proposes improvements you may not have thought of:
- missing journeys (onboarding, account deletion, admin tools),
- edge cases (two people booking the last spot, offline use),
- features users will expect because competitors have them, cited with sources,
- differentiators,
- accessibility, privacy and GDPR rights, abuse protection, analytics, app-store requirements.

They appear as a separate, numbered block with a reason and an impact/effort estimate:
```
💡 Suggestions (round 3)
S3.1  Waitlist when a class is full: auto-offer freed spots   impact H · effort M · MVP?
      why: reduces empty spots from late cancellations (Mindbody and ClassPass both have it)
```
Answer in one line, e.g. *"accept 1, defer 2, reject 3: not for our users"*. Accepted ideas go into the PRD, deferred ones into its "Later" list, and rejected ones are logged with your reason and never suggested again. **Nothing enters the PRD without your explicit accept.** The full history is in `docs/product/suggestions.md`. Before discovery finishes, a final pass reviews the whole PRD for completeness.

Control the volume with `--suggest off|light|bold` (default `light`: up to 3 per round, focused on gaps), or just say "more ideas" or "stop suggesting" during the conversation.

**Output** (`docs/product/`):
- `vision.md`: problem, users, goals, non-goals.
- `prd.md`: features with user stories and **acceptance criteria**. This is the contract that all tests are derived from.
- `glossary.md`: domain terms, so agents name things consistently.
- `suggestions.md`: every enhancement suggestion and what you decided.

**Tips for good requirements**
- Bring whatever you have (notes, screenshots described in text, competitor names). Pass a file path as the argument.
- Push back on proposals. Anything Claude suggests stays marked **proposed** until you accept it.
- Spend your effort on **acceptance criteria**. Vague criteria lead to vague tests and to rework later.
- Give numbers for non-functional needs ("500 gyms, 50k members within 2 years") even if they're rough. The architect designs to them.
- A researcher agent can check facts mid-conversation (for example "does Stripe support X in Greece?").

**Editing the PRD by hand** is fine: it's Markdown in git. Keep the `F<k>` numbering and the Given/When/Then format, then run `/adlc-core:plan-backlog --revise` so the backlog follows.

---

## 7. Defining the architecture

```text
/adlc-core:architect              # new project
/adlc-core:architect --assess     # existing codebase
/adlc-core:architect --resume
/adlc-core:architect --debate     # review as a live agent-team debate (more tokens; experimental)
```

The **solution architect** works through nine steps with you:

1. **Quality attributes:** turns the non-functional notes into measurable targets, each tagged:
   - **now**: designed and built for today.
   - **later**: expected. The design leaves a *seam* and names a *trigger* for acting on it.
   - **speculative**: written down, deliberately not designed for.
2. **Constraints:** team skills, budget, hosting, compliance, enabled stacks.
3. **Options:** 2–3 candidate architectures with trade-offs, and a recommendation. Library choices are fact-checked by the researcher.
4. **Decisions:** one ADR per significant choice. Each stays *proposed* until you accept it.
5. **Design:** C4 diagrams, module boundaries, data model, API conventions (including versioning for old app versions), security, deployment, observability, testing strategy.
6. **Evolution plan:** what is not built now, and what would trigger building it.
7. **Fitness functions:** the architecture turned into automated checks (module boundary rules, API contract tests, bundle-size budget, migration lint) that run on every delivery.
8. **Independent review:** an Opus architecture-reviewer tries to break the design. You decide which findings to address.
9. **Hand-off:** updates `adlc.yaml` (stacks, platforms) and drafts `adlc.build.yaml`.

**Output** (`docs/architecture/`): `architecture.md`, `quality-attributes.md`, `evolution.md`, `fitness.md`, `adr/`, `review-<date>.md`. The PR is **not** auto-merged, because you approve architecture explicitly.

**Why it matters later:** every delivery run's feature-architect must stay within the accepted ADRs, the code-reviewer blocks undocumented deviations, and the fitness functions run on every build. Architecture doesn't erode across hundreds of agent PRs.

---

## 8. Planning the backlog

```text
/adlc-core:plan-backlog
/adlc-core:plan-backlog --revise    # after PRD or architecture changes
```

1. The **backlog-planner** drafts `.adlc/backlog.md`:
   - **milestones** (releases) and **epics** (groups of features);
   - **issues**, each one a vertical slice of user-visible value that fits in one delivery run, with acceptance criteria and a risk hint;
   - **dependencies**, only the real ones, plus a Mermaid dependency graph and the critical path;
   - the **walking skeleton** first (new projects), spikes early for risky unknowns;
   - a **Later** list (deferred items with their triggers) and any PRD features not mapped to an issue.
2. **You review it in conversation:** split or merge issues, reorder, move things between milestones, cut scope. Nothing is created until you say so.
3. **On approval**, Claude creates everything on GitHub:
   - milestones, and epics with their issues attached as **sub-issues**;
   - issues with native **"blocked by"** dependencies;
   - label `adlc:ready` for issues with no blockers, `adlc:queued` for the rest.

The poller promotes `queued` → `ready` when all blockers are closed, so implementation follows the dependency graph and independent issues can run in parallel.

### Writing issues by hand
You can always add issues yourself. Give them this shape and label them `adlc:ready` (or `adlc:queued` with "blocked by" links):

```markdown
Short user-facing summary of the change.

**Feature:** prd.md F3 · **Epic:** #12
**Acceptance criteria**
- AC1: Given a member with a booking, When they cancel more than 2h before class, Then the spot is released and they get a confirmation
- AC2: Given less than 2h remains, When they try to cancel, Then they see the late-cancellation policy and nothing changes
**Notes for the architect:** touches the bookings module; see ADR 0004 (time zones)
```
If the acceptance criteria are missing or ambiguous, the requirements analyst writes them itself or asks you questions on the issue (see `adlc:needs-info` in [§10](#10-day-to-day-operation)).

> Only issues and comments from **repo collaborators** are acted on. Text from anyone else is ignored, to prevent prompt injection.

---

## 9. Delivery: from issue to merged PR

```text
/adlc-core:deliver <issue-number>       # manual / supervised
```
Unattended: the poller runs the same command for each `adlc:ready` issue, in that issue's own worktree.

| # | Stage | Agent (model) | Output |
|---|---|---|---|
| 0 | Setup | lead | branch `adlc/<n>-<slug>`, label `adlc:in-progress` |
| 1 | Understand | codebase-scout (Haiku) → requirements-analyst (Opus) | `context-map.md`, `spec.md` |
| 2 | Design | feature-architect (Opus) | `design.md`, `tasks/`, risk tier |
| 3 | Tests first | test-designer (Sonnet) | failing acceptance tests |
| 4 | Build | implementer ×N in parallel (Sonnet), each in its own git worktree | task branches merged into the feature branch |
| 5 | Verify | build-runner (Haiku) ⇄ debugger (Sonnet → Opus on the last attempt), up to 3 attempts | `verify-*.md` |
| 6 | QA | qa-engineer (Sonnet): e2e flows on web and Android, iOS in CI | `qa-*.md` |
| 7 | Review | code-reviewer (Sonnet; Opus for high risk) ∥ security-reviewer (Sonnet) | `review.md`, `security.md` |
| 8 | Release | release-manager (Haiku) | PR with summary, AC → test mapping, risk, evidence |

### Labels
```
adlc:queued ──► adlc:ready ──► adlc:in-progress ──► adlc:pr-open ──► (merged, issue closed)
                                   │
                                   ├──► adlc:needs-info          questions posted on the issue
                                   ├──► adlc:blocked             retry budget exhausted, summary posted
                                   └──► adlc:needs-human-review  high risk, proposed ADR, or untrusted author
```

### Risk tiers and merging
| Risk | Typical changes | Review | Merge |
|---|---|---|---|
| low | UI tweaks, small logic inside one module | Sonnet | automatic when CI is green |
| medium | new endpoint, schema addition, cross-module refactor, native module | Opus | automatic when CI is green |
| high | auth, payments, secrets, destructive migrations, CI/infra, new dependency, **any proposed ADR** | Opus + security | **you merge** |

Which tiers auto-merge is set in `adlc.yaml → autonomy.auto_merge`.

### Where the code lives while a run is working
- GitHub is the source of truth. On the dev server, the project lives in a **host folder** `/srv/adlc/projects/<slug>/`, bind-mounted into the runner.
- Every delivery run works in its **own git worktree** (`runs/<n>/`, branch `adlc/<n>-<slug>`). Parallel runs and your interactive sessions never interfere with each other.
- The branch is **pushed after every phase**, so you can follow progress on GitHub (spec → design → commits). After the merge the worktree is removed.
- You change code from your own clone and PRs as usual. Pushing to an agent's PR branch is fine once it's `adlc:pr-open`.

### Environments
| Env | Runs on | Built from | Updates |
|---|---|---|---|
| **test** (one per run) | Docker Compose in the project's Docker sidecar on the dev server | the run's source folder, **no registry** | **live reload** while agents code (API watcher, Metro Fast Refresh); a production-like build for the gating e2e tests |
| **dev** | Docker Compose on the dev server | images from the registry, built by CI after merge | automatically on every merge |
| **prod** | **Docker Swarm** (default) | the same images, promoted by release tag | GitHub Actions deploy job, **after your approval**; rolling update with automatic rollback |

**Live preview:** each run is reachable at `http://<n>.app.<slug>.<base-domain>` / `<n>.api.<slug>.<base-domain>` (the base domain defaults to `<dev-server-ip>.nip.io`, so it works without DNS setup), so you can watch the app change as the agents work. On a phone, an Expo development build can load the run's JavaScript from the dev server, including on a real iPhone.

### Testing in a run
- Each run gets its **own environment** (fresh Postgres/Redis, seeded data, mocked third-party APIs), built directly from the run's source. No image building or registry round-trips.
- Tests are written **before** the code, straight from the acceptance criteria.
- Per run: smoke tests plus the affected e2e flows. Nightly: a scheduled CI workflow (set up by the walking skeleton, no agent tokens) runs the full e2e suite on `main` and opens failures as `adlc:regression` issues, which the pipeline then fixes.
- **iOS** e2e runs in GitHub CI on macOS runners. The PR's required checks must pass before merge.
- **Flaky tests** are retried once. If they pass on retry they are quarantined and a follow-up issue is opened. They are never silently deleted.

---

## 10. Day-to-day operation

| Situation | What you do |
|---|---|
| **`adlc:needs-info`** | Answer the questions in an issue comment, then relabel `adlc:ready`. The run resumes from where it stopped. |
| **`adlc:blocked`** | Read the summary comment (phase, reason, report paths). Fix the cause (clarify the issue, resolve a `tbd` setting, fix the environment), then relabel `adlc:ready`. Or open an interactive session and run `/adlc-core:deliver <n>` to work through it with Claude. |
| **High-risk PR** | Review it like any PR. The body shows the spec, risk reason, AC → test mapping and review verdicts. If it contains a **proposed ADR**, accepting the PR accepts the ADR (change its status to `accepted` before merging). |
| **An agent asks for a `tbd` setting** | `/adlc-core:init --update <section>`, then relabel the issue `adlc:ready`. |
| **Change priorities** | Reorder or relabel issues on GitHub, or `/adlc-core:plan-backlog --revise`. |
| **Pause the pipeline** | `adlc pause <slug>` (running runs finish), or remove `adlc:ready` labels. |
| **Watch progress** | GitHub (labels, PRs). `adlc status`, `adlc logs <slug> run <n>`. 🚧 Planned: push notifications and a daily digest on a pinned "ADLC status" issue. |
| **Supervise a run live** | Connect to the runner's Remote Control session and run `/adlc-core:deliver <n>` yourself. |

---

## 11. Evolving the project

| You want to… | Do this |
|---|---|
| Add a feature | `/adlc-core:discover <feature idea>` (it updates `prd.md`) → `/adlc-core:plan-backlog --revise` |
| Make a small change | Write an issue with acceptance criteria → label `adlc:ready` |
| Change an architectural decision | `/adlc-core:architect --resume` → new ADR superseding the old one → `plan-backlog --revise` for any migration work |
| Change setup (registry, environments, autonomy…) | `/adlc-core:init --update <section>` → re-run `.adlc/provision.sh` if GitHub settings changed |
| A "later" quality attribute's trigger fires | `/adlc-core:architect --resume` and point it at the trigger in `evolution.md` |

---

## 12. Configuration reference

| File | Purpose | Who changes it |
|---|---|---|
| `adlc.yaml` | **Policy:** setup values, stacks, platforms, autonomy, network mode | You, via `/init` and `/architect`. **Read-only for unattended agents.** |
| `adlc.build.yaml` | **Build profile:** install/lint/typecheck/arch_check/build/test commands, environment lifecycle, e2e targets | `/architect` drafts it, the walking skeleton makes it real. Changes count as high risk. |
| `CLAUDE.md` | Project instructions loaded by every agent. The block between `adlc:setup` markers is generated. | You (outside the markers), `/init` (inside) |
| `docs/project/setup.md` | Setup decisions, reasons, open items, change log | `/init` |
| `.claude/settings.json` | Registers the ADLC marketplace and enables plugins | `/init` |

Templates with all keys and defaults: [templates/project/](templates/project/).

Key settings:
```yaml
# adlc.yaml
autonomy:
  auto_merge: [low, medium]        # set to [] to approve every PR yourself
  max_parallel_implementers: 3
  retries: { build: 3, qa: 2, review: 2 }
network:
  mode: audit                      # open | audit | allowlist
environments:
  dev:  { runtime: docker-compose, deploy: { trigger: on-merge, mechanism: pull-deployer } }
  prod: { runtime: docker-swarm,   deploy: { trigger: release-tag, approval: true } }
  agent_deploy: [dev]              # where agents may deploy without a human
```

---

## 13. Agents and models

Models are chosen per task, for quality where it matters and low cost where it doesn't: **Haiku reads and summarises, Sonnet writes code, Opus makes decisions.** A failed step is retried with a stronger model before the run gives up.

| Agent | Model | Job |
|---|---|---|
| codebase-scout | Haiku | Maps the relevant code once so nobody else re-reads the repo |
| requirements-analyst | Opus | Issue → testable spec, asks questions only when truly blocked |
| feature-architect | Opus | Design within the ADRs, risk tier, parallel tasks |
| test-designer | Sonnet | Failing acceptance tests before any code |
| implementer | Sonnet | One task each, isolated worktree, in parallel |
| build-runner | Haiku | Runs checks, condenses logs to root errors |
| debugger | Sonnet → Opus | Fixes root causes; may not skip or weaken tests |
| qa-engineer | Sonnet | E2E flows plus capped exploratory testing |
| code-reviewer | Sonnet / Opus | Merge gate: correctness, AC coverage, ADR compliance |
| security-reviewer | Sonnet | Exploitable issues only |
| release-manager | Haiku | PR, labels, auto-merge |
| researcher | Sonnet | Fact-checking with sources (discovery, architecture) |
| product-advisor | Opus | Enhancement suggestions during discovery |
| architecture-reviewer | Opus | Adversarial review of the architecture |
| backlog-planner | Opus | PRD + architecture → dependency-ordered issues |

The orchestrating sessions never read code or logs. They receive at most 15-line status reports, and all details flow through files in `.adlc/runs/<n>/`. Agent definitions: [plugins/adlc-core/agents/](plugins/adlc-core/agents/).

---

## 14. Safety model

- **Containerised runner:** non-root user on a network with **no internet route**. All traffic goes through the egress proxy (audit → allowlist). Test environments run in a per-project Docker-in-Docker sidecar (Sysbox if available), never on the host's Docker. No production credentials.
- **Scoped credentials:** the agents' GitHub token covers only the project repo and has no admin rights. Admin actions go through `provision.sh`, which you run yourself.
- **Guard hook** on every tool call. It blocks force-push, pushes to protected branches, direct merges (only `--auto` is allowed), repo administration, reading secret files, and (in unattended mode) edits to `adlc.yaml`, `CLAUDE.md` and `docs/project/`.
- **GitHub branch protection** and required CI checks are the final merge gate.
- **Only collaborators' issues and comments** are acted upon.
- **Humans approve** setup, architecture, and every high-risk change.

---

## 15. Extending ADLC with stack packs

The core is technology-agnostic. Technology know-how lives in **stack packs**: plugins that add skills, specialised agents, sidecars, setup questions, e2e tooling and network domains. A project enables them in `adlc.yaml → stacks`.

Planned packs: `stack-react-native`, `stack-node-api` (Phase 4), then others such as ESP32. A pack-authoring guide will follow. 🚧

---

## 16. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Issue never starts | It's `adlc:queued` (blockers still open), or its author isn't a collaborator (`adlc:needs-human-review`), or the poller is paused or out of quota. |
| Runs hit usage limits | All agents share your plan's quota. Lower `ADLC_MAX_PARALLEL_RUNS`. The poller backs off and retries automatically. |
| `adlc:blocked` with "environmental" | Sidecar down, emulator missing (`/dev/kvm`), or a domain blocked by the network allowlist. Check the run's `reports/` and the proxy audit log. |
| Agent blocked on a `tbd` key | `/adlc-core:init --update <section>`, then relabel `adlc:ready`. |
| Plugins not loaded | `claude plugin validate`, check `.claude/settings.json`, and trust the folder in an interactive session once. On the runner, `adlc up <slug>` re-installs them. |
| Poller log says GitHub rejects the token | PAT expired or missing a permission: `adlc secrets <slug>` then `adlc up <slug>`. |
| A build in a run fails to download something | The domain is blocked in allowlist mode: `adlc audit <slug>`, add it to `adlc.yaml → network.extra_domains`. |
| Services in a test environment can't reach each other (HTTP 403) | The service lacks `NO_PROXY: "*"`. See the networking rules in the testing contract. |
| `adlc up` warns "edge proxy could not start on port 80" | Another service uses port 80: `adlc up <slug> --edge-port 8088` (stored for all projects). Preview URLs then end in `:8088`. |
| Claude app: session stuck on "Connecting" / "Can't reach adlc-<slug>" after `adlc up` | Each runner restart creates a **new** Remote Control environment; old sessions don't reconnect. Start a new session on the online **adlc-<slug>** environment (or open the link shown in `adlc attach <slug>` → window rc). Right after a restart, rc may report "folder already served" for ~3 minutes until the old registration expires; it recovers by itself. |
| Preview URL returns 404 | The service isn't on the `adlc-web` network or lacks Traefik labels; check with `adlc attach` → shell → `docker ps`. |

---

## 17. Repository layout

```
adlc/
├── .claude-plugin/marketplace.json     this repo is a Claude Code plugin marketplace
├── plugins/adlc-core/
│   ├── commands/   init, discover, architect, plan-backlog, deliver
│   ├── agents/     the 15 subagents
│   ├── skills/     handoff-contracts, testing-contract, project-setup
│   └── hooks/      guard.sh (safety checks on every tool call)
├── templates/project/                  files /init places in a project
│   ├── .claude/settings.json
│   ├── CLAUDE.md
│   ├── adlc.yaml                       policy
│   └── adlc.build.yaml                 build profile
├── sandbox/
│   ├── compose.project.yml             runner + Docker sidecar + egress proxy (per project)
│   ├── runner/                         image, entrypoint, Remote Control loop, poller, dev deployer, stack layers
│   ├── egress/                         Squid proxy + domain allowlists (core, per stack)
│   └── edge/                           host-level Traefik for preview URLs
├── bin/adlc                            host CLI: doctor, secrets, up, login, attach, status, pause, logs, audit, down
└── docs/architecture.md                design of ADLC itself
```
