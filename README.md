# ADLC: Agentic Delivery Life Cycle

ADLC is a software delivery pipeline built on [Claude Code](https://code.claude.com). You describe what you want. ADLC helps you shape it into a product spec and an architecture, breaks it into GitHub issues, and then delivers those issues one by one as tested, reviewed pull requests, largely unattended.

It is packaged as a Claude Code **plugin marketplace**, so a project gets the whole pipeline (agents, commands, skills, guardrails) from git. Nothing is installed by hand.

> **Status:** in daily use since October 2026 on a full-stack product (Node API, React web app, Expo mobile app): 118 agent pull requests delivered and merged in its first three weeks, with CI on two self-hosted machines. Runs on a Linux x86_64 dev server (Docker Engine); Docker Desktop on macOS works for trying it out. Each plugin is versioned on its own (`adlc-core` 0.1.x), and there are no tagged ADLC releases yet: follow `main`, and read the commit log before updating a dev server. Features not built yet are marked 🚧. The design is in [docs/architecture.md](docs/architecture.md).

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
15. [Stacks: what ADLC knows about your technology](#15-stacks-what-adlc-knows-about-your-technology)
16. [Troubleshooting](#16-troubleshooting)
17. [Repository layout](#17-repository-layout)
18. [License, support and contributing](#18-license-support-and-contributing)

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

**Quick start** (about an hour, most of it waiting for builds):
1. **Dev server:** a Linux machine with Docker; clone ADLC and run `adlc doctor` ([§3](#3-installation)).
2. **GitHub:** create your project's repo and the ADLC GitHub App, which gives the agents their own identity ([§3](#agent-identity-the-adlc-github-app-recommended)).
3. **Runner:** `adlc secrets <slug>`, `adlc up <slug> --repo <owner>/<slug>`, `adlc login <slug>`, then `adlc ui up` for the dashboard.
4. **Plan with Claude** from claude.ai/code or the Claude app: `/adlc-core:init` (including your [stacks](#15-stacks-what-adlc-knows-about-your-technology)), `discover`, `architect`, `plan-backlog` ([§4](#4-starting-a-new-project)).
5. **Let it deliver:** watch the dashboard, review high-risk PRs, answer questions and do your owner tasks ([§10](#10-day-to-day-operation)).

**New to ADLC?** Watch the 11-minute video tutorial (install, a first project and its stacks, adopting an existing codebase, delivery and day-to-day use; with subtitles): in the Field Guide (**▶ Watch the video tutorial**), or [download it](https://github.com/kororos/adlc/releases/tag/tutorial-video). The **ADLC Field Guide** walks through it interactively: an issue-lifecycle simulator (labels, poller, CI, merge train), seven step-by-step tutorials and a label and command reference. Open [`ui/web/public/guide/index.html`](ui/web/public/guide/index.html) from a clone in any browser (it needs no server or network), or use **Guide** in the dashboard's sidebar (`/guide/`).

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
The **rc** window then shows **`Ready · <slug>`**: the server is registered and waiting. Open **claude.ai/code** or the Claude app and pick the session **`adlc-myapp`**. Once you send a message, rc switches to **`Connected`** and you're driving Claude on the dev server (in the worktree `sessions/rc`).

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
gh repo create <owner>/<slug> --private --add-readme     # your own gh login on the host
# create gh_pat (and ci_admin_pat) for <owner>/<slug> on github.com, see the table above
adlc secrets <slug> && adlc up <slug> --repo <owner>/<slug>
adlc login <slug> && adlc attach <slug>                   # one-time login + "Enable Remote Control? y"
adlc session <slug>                                       # → /adlc-core:init
cd /srv/adlc/projects/<slug>/sessions/main && bash .adlc/provision.sh   # on the host, with YOUR gh login (admin)
```

### Agent identity: the ADLC GitHub App (recommended)
With `gh_pat`, agents act as **your** account: you can't approve their PRs (GitHub forbids approving your own), and your admin bypass of branch protection applies to them too. A GitHub App gives the agents their own identity, `<app>[bot]`, with **1-hour tokens** limited to one repo and minted on demand in the runner. You create it **once per GitHub account** and reuse it for every project. It's needed before the poller starts unattended delivery runs.

**1. Create it:** github.com → avatar → Settings → Developer settings → **GitHub Apps → New GitHub App**
| Field | Value |
|---|---|
| GitHub App name | e.g. `adlc-<owner>` (must be unique on GitHub) |
| Homepage URL | `https://github.com/kororos/adlc` (any valid URL) |
| Callback/Setup URL, user authorization, device flow | empty / off |
| **Webhook → Active** | **unchecked** |
| Repository permissions | **Contents, Issues, Pull requests, Workflows: Read and write** · **Actions, Commit statuses: Read-only** · Metadata: Read-only (automatic) · everything else **No access** |
| Organization / Account permissions | all **No access** |
| Where can it be installed | **Only on this account** |

Then **Create GitHub App** → note the **App ID** (not the Client ID) → **Private keys → Generate a private key** (a `.pem` downloads) → **Install App** → *Only select repositories* → `<owner>/<slug>`. For later projects, add their repos to the same installation.

**2. Configure the runner.** `adlc up` restarts the runner, so commit and push open session work first:
```bash
scp ~/Downloads/adlc-<owner>.*.private-key.pem dev-server:/tmp/app.pem      # from your Mac
adlc app <slug> --id <APP_ID> --key /tmp/app.pem && shred -u /tmp/app.pem   # on the dev server
cd ~/adlc && git pull && adlc up <slug>
docker logs adlc-<slug>-runner-1 2>&1 | grep identity          # GitHub identity: adlc-<owner>[bot] (app mode)
docker exec adlc-<slug>-runner-1 gh api repos/<owner>/<slug> --jq .full_name   # <owner>/<slug>
```
Delete the downloaded `.pem` on your Mac (a new key can always be generated on the app page).

**Record it in the project:** `/adlc-core:init` stores `identity: { agents: github-app, app: <app-slug> }` in `adlc.yaml` (the slug is what `adlc status <slug>` shows as `<slug>[bot]`). Before every run, the poller checks that the runner really acts as that app. If not, nothing starts and the poller log says why. Issues and labels from this identity, such as the backlog that `/adlc-core:plan-backlog` creates, are trusted like your own; issues from anyone else who isn't a collaborator need you to add `adlc:ready`.

**3. Retire the personal token:** `: > /srv/adlc/secrets/<slug>/gh_pat`, then revoke that token under Settings → Developer settings → Fine-grained tokens. Keep `ci_admin_pat` (the CI registrar still uses it).

**What changes:**
- Agent PRs are authored by `adlc-<owner>[bot]`.
- The bot can't push to `main` (it isn't an admin).
- Low/medium-risk PRs auto-merge through branch protection; `/.github/` and `/deploy/` PRs wait for **your** approval.

Limitation: apps can't edit Project boards owned by a personal account.

### CI runner (self-hosted, sandboxed)
Jobs run on GitHub-hosted runners unless a repository variable sends them to the **ADLC CI runners** on your dev server. Jobs that need your network, such as **publishing images to an internal registry**, always run there (`[self-hosted, adlc-publish]`). They're enabled per project by setting `ci_admin_pat`. Each role has its own runners, so a publish never waits behind a test job, and an Android job doesn't hold up the checks:

| Role | Registrar + Docker engine | Labels | Jobs |
|---|---|---|---|
| test | `ci` + `ci-docker` | `self-hosted,linux,adlc-test` | lint, typecheck, arch-check, test, e2e-web |
| publish | `ci-publish` + `ci-docker-publish` | `self-hosted,linux,adlc-publish` | publish |
| kvm | `ci-kvm` + `ci-docker-kvm` (only with `adlc up <slug> --ci-kvm on` or `--ci-roles …,kvm`) | `self-hosted,linux,adlc-kvm` | e2e-android |

- Each **registrar** holds `ci_admin_pat` and keeps **one single-use (JIT) runner waiting** in its own engine. It never runs workflow code.
  - **test** starts the next runner as soon as the waiting one takes a job, so several test jobs run at once: up to `ADLC_CI_PARALLEL` (default: the host's slots), within the shared capacity below.
  - **publish** and **kvm** run one job at a time.
- Each role has its **own Docker engine**, which agents can't reach, behind the same egress proxy.
  - publish and kvm: before each new job, everything the previous job left behind is removed.
  - test: parallel test jobs share the engine. Their containers are kept apart by run: compose project `adlc-ci-<run id>`, its own edge aliases, no host ports. Before each new runner, the registrar removes what finished runs left (their `adlc-ci-<run id>` projects and work folders). When no test job runs, the engine is wiped completely.
  - A pull-request job can never reach a publish job or leave anything behind for it. Test jobs hold no secrets.
- **Shared capacity:** the roles share the host's CPU. `ADLC_CI_SLOTS` (default 2) is the capacity. A test or publish job takes 1 slot, an Android job takes 2 (`ADLC_CI_WEIGHT_KVM`). So by default an Android job runs alone, and two test jobs, or a test and a publish job, can run side by side.
  - A registrar starts a runner only when its job fits next to the running jobs (all roles, its own included), and removes an idle runner that no longer fits.
  - To run fewer test jobs at once than the slots allow, set `ADLC_CI_PARALLEL` (e.g. `1`) in `/srv/adlc/config/<slug>.env`, then `adlc up <slug>`.
  - This is best effort: two idle runners can get jobs in the same second.
  - **Role priority on each host:** `ADLC_CI_PRIORITY` (default `kvm,publish,test`). While a job of an earlier role that the same host runs waits on GitHub and wouldn't fit next to a new job, the later roles start no new runner and give up their idle one; running jobs finish, then the waiting job starts. E.g. on a host with `test,kvm`, a waiting Android job isn't held back by a stream of short test jobs (those continue on other hosts). It only looks at the host's own roles (`--ci-roles`), never at host names.
  - On a bigger host, raise the slots in `/srv/adlc/config/<slug>.env`. With `ADLC_CI_SLOTS=4`, an Android job and two test jobs run side by side, or four test jobs.
  - Why: on a 4-vCPU dev server, three jobs at once plus the agents pushed tests with fixed time limits over them.
- **Job time limit:** a registrar stops its runner when a job has run longer than `ADLC_CI_JOB_MAX_MIN` minutes (default 60; `0` turns it off). GitHub then ends the job, the poller treats it as a failed check, and the next job gets a cleaned engine.
  - Why: a job without `timeout-minutes` gets GitHub's 6 hours, so one hung step blocks every later job of that role. (2026-10-22: an Android diagnostics step hung for 2 hours.)
  - The workflow templates set their own, tighter `timeout-minutes`; this is the backstop. Raise it in `/srv/adlc/config/<slug>.env` if a legitimate job takes longer.
- Because agents can edit workflows, two GitHub-side rules (set by `provision.sh`) complete the picture: `.github/` changes need **your review** (CODEOWNERS + "Require review from Code Owners"), and registry **push credentials live in the `publish` environment, limited to `main`**, so PR-branch workflows can't read them.

`adlc logs <slug> ci` shows the registrars. Runners appear under the repo's Settings → Actions → Runners while waiting for a job.

Where jobs run (repository variables, JSON; `provision.sh` sets them from `adlc.yaml ci.runners`):
| Variable | Jobs | Default | On your host |
|---|---|---|---|
| `ADLC_TEST_RUNS_ON` | lint, typecheck, arch-check, test, e2e-web | `"ubuntu-latest"` | `["self-hosted","adlc-test"]` |
| `ADLC_ANDROID_RUNS_ON` | e2e-android | `"ubuntu-latest"` (has KVM) | `["self-hosted","adlc-kvm"]` after `adlc up <slug> --ci-kvm on` (host needs `/dev/kvm`), or on a [CI-only host](#a-second-machine-for-ci-ci-only-host) |
| `ADLC_PUBLISH_RUNS_ON` | publish | `["self-hosted","adlc-publish"]` | |

On your host, `e2e-android` builds the APK first and then starts the stack's emulator container (`deploy/compose.emulator.yml`) in `ci-docker-kvm`, the only engine with `/dev/kvm`. Switching back is one command: `gh variable delete ADLC_ANDROID_RUNS_ON -R <owner/repo>`.
- **Host requirements:**
  - **24 GB RAM** for the dev server. With 15 GB, Gradle or the emulator were killed for lack of memory next to the agents' stacks.
  - `/dev/kvm`. On a VM, enable nested virtualisation: vSphere "Expose hardware assisted virtualization to the guest OS".
  - On a VM, ideally a memory reservation, because nested virtualisation degrades badly under host ballooning.
  - 4 vCPUs is enough. Don't overcommit physical cores.
- **Timings measured on a 4-vCPU / 24 GB VM:**
  - About 28 minutes per job on GitHub-hosted.
  - On the dev server, about 20 minutes with a cold build cache, and about **10 minutes warm**: the APK build drops from 14½ to 4½ minutes thanks to the CI caches, plus about 2½ minutes for boot and flows.
- Android jobs have their own runner, so other checks don't queue behind them.

### A second machine for CI (CI-only host)
CI jobs and the agents share the dev server's CPU. A second VM, **on a different physical host**, can take over CI roles: `adlc up <slug> --ci-only` runs only the CI registrars, their Docker engines and an egress proxy for the project. Agents, the dev deployer, the edge proxy and the dashboard stay on the main host.
- **Runners are pulled, not pushed.** GitHub hands a job to any idle runner with the right labels, so nothing on the second machine has to be reachable from outside. A role can run on both hosts: its jobs then run on whichever has an idle runner.
- **Runner names include the host** (`adlc-<slug>-<host>-<role>-<time>`; none on the main host), and the CI tab shows it. **CI capacity (`ADLC_CI_SLOTS`) is per host**: each host counts only its own busy runners.
- **Network policy:** the proxy reads `adlc.yaml` like on the main host. With no poller clone there, the registrars fetch it from the default branch every 10 minutes. This needs **Contents: read** on `ci_admin_pat`; without it the proxy stays in `ADLC_NETWORK_MODE` (default `audit`), which is enough unless the project uses `allowlist`.
- **Not on a CI-only host:** `login`, `session`, `shell`, `attach`, `train`, `logs <slug> poller`. Run those on the main host.
- **On the dashboard:** the Overview and Health pages show every machine's CPU, memory and disk. The main host is sampled by the dashboard; a CI-only host reports in every 30 s with its own token once you link it (`adlc ui host-token <host>` on the main host, then `adlc ui report <dashboard url>` on the CI host; see Setup). It needs to reach the dashboard's URL over the LAN.

**Suggested VM** for the kvm and test roles (an Android job and a test job side by side):

| | Size | Why |
|---|---|---|
| vCPU | **8** (6 if the host has 8 cores or fewer) | Never more than the host's physical cores minus 2: watch CPU Ready below 5% and Co-stop below 3% |
| RAM | **24 GB**, fully reserved | Android build (Gradle + Kotlin) ~8 GB peak, emulator ~4–6 GB, a test job's stack 4–6 GB. Nested virtualisation degrades badly under ballooning |
| Disk | **150 GB** SSD | One engine per role: kvm ~40 GB (emulator image, Gradle and SDK caches up to 12 GB), test ~30 GB, images and logs |
| CPU option | vSphere "Expose hardware assisted virtualization to the guest OS" | `/dev/kvm` for the emulator |
| OS | Ubuntu 24.04 LTS, Docker CE with the compose plugin | Sysbox optional, as on the main host |
| Network | Outbound internet; Harbor if it runs `publish` | No inbound ports |

**Setup:**
```bash
# on the new VM
sudo mkdir -p /srv/adlc && sudo chown "$USER": /srv/adlc
git clone https://github.com/kororos/adlc ~/adlc && sudo ln -s ~/adlc/bin/adlc /usr/local/bin/adlc
adlc doctor                                   # docker, /dev/kvm, disk
adlc secrets <slug>                           # only ci_admin_pat (add Contents: read to it); Enter for the others
adlc up <slug> --ci-only --repo <owner/name> --ci-roles test,kvm [--ci-host ci2] \
               [--registry harbor.example.com --registry-ca /path/ca.crt]   # same registry flags as the main host
echo 'ADLC_CI_SLOTS=3' >>/srv/adlc/config/<slug>.env && adlc up <slug>   # Android (2) + one test job (1), or three test jobs
adlc logs <slug> ci                           # each registrar: "runner … waiting for a job"

# CPU, memory and disk on the dashboard
adlc ui host-token ci2                        # on the main host: prints the token for this host (its --ci-host name)
adlc ui report http://adlc.<base>[:port]      # on the CI host: asks for that token; adlc logs <slug> hoststats

# on the main host, once no Android job runs: drop kvm there (test stays on both hosts)
adlc up <slug> --ci-roles test,publish
docker volume rm adlc-<slug>_ci-data-kvm adlc-<slug>_ci-certs-kvm   # frees the old kvm engine's disk
```
Turning a role off on a host stops its registrar and engine; a job running there fails. Updating: `git pull && adlc up <slug>` on each machine.

### Using Harbor (or another private registry)
```bash
adlc up <slug> --registry harbor.example.com \
               --registry-user 'robot$<project>+adlc-pull' \
               [--registry-ca /path/to/internal-ca.crt]          # only for a private CA
adlc secrets <slug>                                              # registry_token = the pull robot's secret
```
In Harbor, create two robot accounts on the project: **pull-only** (for the dev server, as above) and **push** (stored as secrets in the GitHub `publish` environment, used by the publish job). In `/adlc-core:init` choose registry `harbor`, set the namespace `<host>/<project>/<slug>`, and add the Harbor host to `network.extra_domains`. Publishing runs on the ADLC CI runner, since GitHub-hosted runners can't reach an internal Harbor.

### Production deploys (Docker Swarm)
Prod is deployed **by you**, on the Swarm manager, with `adlc-swarm-deploy`. There's no CI runner on the manager: any workflow on any branch could target its label, so it would let agent-written code run on prod. Agents never deploy prod.
```bash
# once, on the manager
sudo install -m 0755 ~/adlc/sandbox/swarm/adlc-swarm-deploy /usr/local/bin/   # or copy the file over
docker login harbor.example.com                        # prod pull-only robot
# add a read-only deploy key for <owner>/<slug> (repo → Settings → Deploy keys) and use it for git@github.com

# each release
adlc-swarm-deploy <owner>/<slug> v1.4.0 --dry-run      # check: commit on main, all images exist
adlc-swarm-deploy <owner>/<slug> v1.4.0                # predeploy (migrations), then rolling update
adlc-swarm-deploy <owner>/<slug> --history             # what ran when; roll back = deploy the previous ref
# several stacks (e.g. data + app): deploy each one; runs deploy/predeploy.data.sh if present
adlc-swarm-deploy <owner>/<slug> v1.4.0 --file deploy/stack.data.yml --stack <slug>-data
```
It refuses any ref that isn't on `main`, so only code that passed branch protection, CI and (for `/deploy/`) your review can reach prod.

### Hardening with Sysbox (recommended)
Without [Sysbox](https://github.com/nestybox/sysbox), the per-project Docker engines run as **privileged** containers. That isolates test environments from the host's Docker, but it isn't a strong security boundary. To harden:
1. Stop running containers (the installer restarts Docker), install the `sysbox-ce` package for your distro from the Sysbox releases page, and check that `docker info | grep -i sysbox` shows `sysbox-runc`. Check the release notes for supported Docker Engine versions first.
2. New projects use it automatically. For existing ones: `adlc up <slug> --dind sysbox`. This also applies to the CI engine.

### Sessions from the Claude app
All sessions you start from the app on **adlc-<slug>** work in the same folder, `sessions/rc`, on whatever branch is checked out there. So a phase such as discovery simply continues in the next session, even after `adlc up`: send `/adlc-core:<phase> --resume`. Don't run two app sessions at the same time; they'd share the folder. For parallel work use `adlc session <slug> <name>`, which gets its own worktree. (Set `ADLC_RC_SPAWN=worktree` in `/srv/adlc/config/<slug>.env` if you'd rather have a fresh worktree per app session.)

On every runner restart, worktrees of ended sessions are removed if they hold no uncommitted work (their branches and commits stay), and `sessions/rc` returns to `main` only when it's idle. A phase branch checked out there is kept.

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
| `adlc status [slug] [--all]` | containers, active runs, paused/backoff state, dev version, login state, and the **open work in order of precedence** (next 15; `--all` for everything): owner tasks in place, each issue's state and what it's waiting for |
| `adlc session <slug> [name]` | **interactive Claude session in your SSH terminal**, in its own worktree, also reachable from claude.ai/app (see below) |
| `adlc session <slug> --run <n> [--takeover]` | session inside delivery run #n's worktree; `--takeover` stops the unattended run so you can continue it |
| `adlc shell <slug>` | bash inside the runner, with `gh` authenticated |
| `adlc attach <slug>` | tmux with windows **rc** (Remote Control), **poller**, **deployer**, **shell** and your sessions (detach: Ctrl-b d) |
| `adlc pause` / `resume <slug>` | stop/start launching new runs (running ones finish) |
| `adlc logs <slug> [poller\|deployer\|rc\|egress\|ci\|hoststats\|run <n>]` | follow logs (Ctrl-C to stop; don't pipe into `tail`, they never end). `hoststats` (CI-only host) shows whether its stats reach the dashboard. `run <n>` shows the agent's narrative and cost for the latest run of issue n |
| `adlc audit <slug>` | domains reached through the egress proxy and whether each is allowlisted |
| `adlc restart <slug> [--force]` | restart the runner: reloads the ADLC **plugins** (commands, agents, skills) after `git pull`. The runner's **scripts** (poller, merge train, queue, CI registrar, Remote Control loop) are built into its image: load those with `adlc up <slug>` (pause and let running deliveries finish first). `restart` and `adlc doctor` warn when the image is older than the checkout. Refuses while delivery runs are active unless `--force` |
| `adlc down <slug>` | stop the project (workspace, volumes and login are kept) |
| `adlc doctor` | host checks: Docker, /dev/kvm, disk, secrets, whether each runner runs this checkout's scripts, and each project's CI roles, slots and test jobs at once on this host. Warns when the test runner would stop during Android jobs (too few slots) or when the running registrars use a different slot count than the config (`adlc up <slug>`) |
| `adlc ui host-token <host> [--rotate\|--remove]` | on the main host: the token a CI-only host reports its CPU, memory and disk with ([setup](#a-second-machine-for-ci-ci-only-host)) |
| `adlc ui report <dashboard url>` | on a CI-only host: start reporting to the dashboard (asks for that token) |

### Option B: locally, in any Claude Code session
```text
/plugin marketplace add https://github.com/kororos/adlc.git
/plugin install adlc-core@adlc
```
Projects created by `/adlc-core:init` also contain a `.claude/settings.json` that registers the marketplace. Anyone who clones the project and trusts the folder gets the plugins automatically. Inside the runner, delivery runs and sessions use the runner's local copy of ADLC instead of that GitHub entry, so a private ADLC repository works without giving the runner access to it.

> Use **Opus** as the session model for `/init`, `/discover`, `/architect` and `/plan-backlog`. Those roles run in your main session, and their quality sets the ceiling for everything downstream.

---

## 4. Starting a new project

All commands below run in an interactive Claude Code session, in an empty folder or a fresh clone.

### Step 1: Project setup (`/adlc-core:init`), about 15 minutes, once
```text
/adlc-core:init
```
Claude asks for the project name, description, platforms and **stacks** (the technologies ADLC brings know-how for, see [§15](#15-stacks-what-adlc-knows-about-your-technology)). Then it goes section by section. Each section shows the proposed values with a one-line reason; you confirm, change, or answer `tbd`:

| Section | Examples of what is decided |
|---|---|
| Project | name, slug, owner, licence |
| Source control | GitHub repo, visibility, monorepo layout, protected branches, squash merges, CODEOWNERS |
| CI/CD | GitHub Actions, macOS runner for iOS, required checks, CI budget |
| Container registry | GHCR (default), image names, tag scheme, retention, vulnerability scanning |
| Environments | a profile per environment: **runtime** (default: dev = Docker Compose on the dev server, prod = **Docker Swarm**), hosts/nodes, URLs, deploy trigger and approval, ingress/TLS, replicas, rolling-update policy, secrets, database placement and backups, how migrations run, **where agents may deploy on their own** (default: dev only) |
| Mobile | bundle IDs, Expo EAS build/update, store accounts, signing |
| Secrets | where secrets live (names only, never values); secret files per environment: location, directory and file mode, and the command to add one |
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

ADLC can take over an existing codebase and work **within its architecture**: it reads what's there, records it, and from then on every agent follows it.

1. **Set up the runner** for the existing repository as in [§3](#3-installation): `adlc secrets <slug>`, `adlc up <slug> --repo <owner>/<repo>`, and install the ADLC GitHub App on that repository. There's no `gh repo create`; nothing in the repository changes yet.
2. **Record the setup:** `/adlc-core:init`. Claude detects what already exists before asking: the repository's settings and branch protection, CI workflows and required checks, Dockerfiles and the registry they push to, Expo config, Renovate or Dependabot, `.env.example`. It proposes those values, marked "detected", instead of ADLC's defaults. Run `provision.sh` to add the ADLC labels, environments and branch protection.
3. **Choose the stacks** that match the code (init asks; [§15](#15-stacks-what-adlc-knows-about-your-technology)). A stack's conventions are defaults, so where your code already does things differently, the ADRs from the next step win. If your organization has its own conventions for this kind of application, use (or [create](docs/stacks/README.md)) its stack: the stack then carries the organization's rules, and the ADRs this codebase's own decisions.
4. **Reconstruct the architecture:** `/adlc-core:architect --assess`. The codebase-scout maps the code at architecture level (modules and dependencies, data stores and schemas, API surface, auth, state, build and deploy, test setup), and the architect writes the *as-is* architecture, **retroactive ADRs** (accepted, "recorded retroactively") and a **Risks & debt** list. It designs new parts only for what the product needs and the code lacks. Review it carefully: from now on these ADRs constrain every change.
5. **Write the build profile:** `--assess` drafts `adlc.build.yaml` from your existing scripts (package.json, Makefile, CI workflows) and asks you to confirm each command works. The agents and CI run exactly these commands, so check them in the runner (`adlc shell <slug>`).
6. **Bring in work:**
   - For a **new feature**: `/adlc-core:discover <feature idea>`. On an existing codebase it first maps what the product already does (features, screens, endpoints, roles), then works out the feature against it. Then `/adlc-core:plan-backlog`.
   - For **existing issues**: make sure they follow the [issue format](#writing-issues-by-hand), then label them `adlc:ready`.
7. Start with one or two **low-risk issues** delivered under supervision (`/adlc-core:deliver <n>` in an interactive session) before enabling the poller.

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
   - label `adlc:ready` for issues with no blockers, `adlc:queued` for the rest;
   - **owner tasks** (accounts, credentials, prod infrastructure, legal, reviews, prod deploys, release sign-offs) labelled `adlc:owner` and assigned to you. Agents never run them; agent issues that need one are "blocked by" it.

The poller promotes `queued` → `ready` when all blockers are closed, so implementation follows the dependency graph and independent issues can run in parallel. **Closing an owner task starts the work it was blocking** (within a minute, unless the pipeline is paused). `adlc status <slug>` lists the open work in the order it will happen, with your owner tasks where they stand in the way.

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
| 2 | Design | feature-architect (Opus), including the test setup a change needs (seed data, e2e helpers, limits, secrets) | `design.md`, `tasks/`, risk tier |
| 3 | Tests first | test-designer (Sonnet) | failing acceptance tests |
| 4 | Build | implementer ×N in parallel (Sonnet), each in its own git worktree | task branches merged into the feature branch |
| 5 | Verify | build-runner (Haiku) ⇄ debugger (Sonnet → Opus on the last attempt), up to 3 attempts. The first verify runs the affected tests or everything (see **How much the agent tests** below); after a fix only the failures and changed code (focused) | `verify-*.md` |
| 6 | QA | qa-engineer (Sonnet): e2e flows on web and Android, iOS in CI | `qa-*.md` |
| 7 | Review | code-reviewer (Sonnet; Opus for high risk) ∥ security-reviewer (Sonnet) | `review.md`, `security.md` |
| 8 | Release | a final verify (affected or full) if anything changed since the last one, then release-manager (Haiku) | PR with summary, AC → test mapping, risk, evidence |

**How much the agent tests** (`verify_scope`, dashboard → Health → Automation → **Tests during delivery**, or `adlc.yaml → autonomy.verify_scope`):
- `affected` (default): lint, typecheck, arch checks and build run on everything. Tests run only for what the branch affects: the packages it changed and the packages that depend on them, and in those only the test files related to the change (vitest `--changed`), plus every test file it added or changed. A change to something tests use without importing it (migrations, seed data, test setup, config) runs the whole suite of the package that contains it (a migration in `apps/api` → the whole API suite), and the related tests elsewhere. Root-level changes (lockfile, root config, the test environment's compose files, `adlc.build.yaml`) run every selected package's whole suite. QA runs the `@smoke` flows and the flows the change affects. A failure in a test file the branch didn't touch is run once more on its own; if it passes, it's reported as flaky instead of being debugged. The full suite runs in the PR's CI, which must be green before anything merges; a red CI goes back to the agent as a rework. A rework (conflicts, review changes) whose PR head last passed CI tests only what changed since that commit: the merged `main`, the conflict resolutions and its own fixes. A project can define its own selection as `commands.test_affected` in `adlc.build.yaml` (`{base}` is the default branch).
- `full`: every verify before Review and before release runs the whole suite, as before.
- `auto`: `full` for high-risk issues, `affected` for low and medium. A new issue's risk is known only after Design, so the run decides then (the Now tab shows "tests: auto" until it does); a rework uses the risk already recorded.
- **Per issue:** the label `adlc:verify-full` or `adlc:verify-affected` on an issue overrides the switch for that issue (the runner creates both labels). The scope is read whenever a run starts, so a label added mid-run applies from the next rework. The dashboard's **Now** tab shows "affected tests" or "full tests" next to the risk, and the PR's Verification section says which ran.
- The exhaustive runs are every PR's CI, `main`'s CI after each merge, and the nightly workflow (web e2e, Android, audit).

**Nightly checks on demand:** the dashboard's **Health → Nightly checks** card shows the nightly workflow's latest run (`adlc.yaml → ci.nightly_workflow`, default `nightly.yml`) and starts it with **Run now**. The runner sends a `repository_dispatch` event of type `adlc-nightly`: the agents' token can send that (Contents write) but can't start workflows directly (Actions is read-only). So the workflow needs `repository_dispatch: { types: [adlc-nightly] }` under `on:` (the `ci-workflows` template has it); until then the card says what to add. Never give a deploy workflow that trigger. A failed run opens a regression issue, as on schedule.

### Labels
```
(no state) ─► adlc:queued ─► adlc:ready ─► adlc:in-progress ─► adlc:pr-open ─► merged (issue closed)
```
- **Into the pipeline:** **Start** on the dashboard (queued while blockers are open, else ready); a regression starts by itself, once. Queued becomes ready when every "blocked by" issue is closed.
- **Back to ready, by ADLC:** the runner restarted mid-run, or Claude's usage limit hit (it resumes from the last pushed phase); a PR's checks failed or it conflicts with `main` (a rework, at most `autonomy.ci_rework_max` times per PR for failed checks, `autonomy.conflict_rework_max` for conflicts). On the dashboard a rework shows a **Rework k** badge next to the phases and starts at Build.
- **To `adlc:needs-info`:** the agent needs a decision. You answer and relabel `adlc:ready`.
- **To `adlc:blocked`:** retries used up, the environment failed, or the run crashed; a summary is on the issue. You fix the cause and relabel `adlc:ready`.
- **To `adlc:needs-human-review`:** reworks used up, or an issue from an outside author. High risk or a proposed ADR keeps the issue `adlc:pr-open` and the PR waits for your approval; approved PRs are merged by the merge train.
- **PR merged, issue still open** (the PR says `Refs #<n>`, not `Closes`, e.g. because some ACs can only be checked on the deployed environment): the poller relabels the issue `adlc:owner` and comments what's left. It shows under the dashboard's **Needs you → Your next tasks**; check it and close the issue. Issues it blocks wait until then.
- **PR closed without merging** (from pr-open, blocked or needs-human-review): the branch is archived, the issue goes back to `adlc:queued` and the next run starts from `main`.

The Field Guide's **Lifecycle** section (dashboard → Guide) draws the same states; click one to see every way in and out.

### When checks fail
- **An agent's PR:** when all checks on its latest commit have finished and one has failed, the poller comments the failed checks on the PR and relabels the issue `adlc:ready`. The delivery agent then reworks the same PR. It classifies each failure first:
  - **code or test bug:** it fixes it,
  - **outdated branch:** it merges `main`,
  - **environment** (runner, emulator, network, disk): it never changes the app or weakens the tests. It opens an issue for the project's test setup, or reports a dev-server or ADLC problem, and sets `adlc:blocked`,
  - **flaky:** it reports it.

  A rework always starts from the PR as it is now: its current checks and mergeability, and new comments on both the issue and the PR, so relabelling an issue `adlc:ready` with a comment on either is enough to ask for something.

  This happens at most once per commit and `autonomy.ci_rework_max` times per PR (default 2). After that the issue gets `adlc:needs-human-review`. Conflicts are counted apart (see below).
- **`main`:** if a push workflow fails on the latest commit, the poller opens one `adlc:regression` issue for it, which the agent picks up like the nightly's. Regressions run ahead of other work (after Run next); one opened without a state (e.g. by a project's own nightly script) is started automatically, once.
- **Merge conflicts:** an agent's PR that conflicts with its base goes back to the agent the same way, at most `autonomy.conflict_rework_max` times per PR (default 5, counted apart from failed checks: with issues running in parallel, every merge ahead of a PR can conflict with it). When the conflicts are all there is to fix, it's a **quick rework** of a few minutes: the agent merges the base, resolves them, checks whether the PR still makes the same change (`adlc-same-change`), runs lint, typecheck and the tests of what the resolution touched, and pushes. It skips the full verify, QA and, when the change is the same, the review; the PR's CI runs the whole suite. A failure there turns it into a full rework. GitHub runs no PR checks while a PR has conflicts, so this is checked first. This includes a PR whose issue is `adlc:blocked` (e.g. waiting for an environment fix), since `main` may move on meanwhile. The agent merges the base, resolves the conflicts keeping both sides' intent, and verifies again. If a conflict needs a product decision, it asks.
- **Behind `main`:** branch protection requires PRs to be up to date, so any merge leaves the other open PRs unmergeable. When an agent's PR has all checks green but is behind its base, the poller merges the base into it (a merge, not a rebase), and its checks run again on the current base. Low and medium risk PRs then merge (by the merge train when it's on, else GitHub's auto-merge); high-risk ones reach you already up to date. Switch it off with `autonomy.keep_prs_current: false`.
- **PRs from people** (yours, Renovate's) are left alone.
- **Switches:** the dashboard's **Health → Automation** card switches the merge train (on / dry-run / off), rework on failed checks and conflicts, and keeping green PRs up to date, live. It shows where each value comes from (set there, `adlc.yaml` or default) and can go back to the project setting. These overrides live on the dev server (`state/settings/`) and don't change `adlc.yaml`.

### New secrets
A feature that adds a secret needs you to create it per environment. Values are never in the repo, and agents never see them. Three things make sure that doesn't slip through:
1. The agent's PR lists it under **Owner setup needed**, with the command to create it.
2. The agent opens an owner task, **"[owner] Create the dev secret <name>"**. Like every owner task that needs you to run something, it says where to run it (e.g. the dev server, as your user) and gives the exact commands in one block, with absolute paths (e.g. `/srv/adlc/projects/<slug>/secrets/dev/<name>`, not `$ADLC_ROOT`, which your shell doesn't have), and a command that checks the result. Paste the block as it is; a value only you have is asked for at a prompt.
3. The dev deployer checks the dev stack's secret files before every deploy. If one is missing, it doesn't deploy. It logs which secret is missing, the PR that added it (whose owner notes say how to create it) and a create command (when `deploy/test/secrets.sh` generates the same secret, the same generator with the dev path, ready to paste), and `adlc status` and the dashboard's **Needs you** tab show the same, with links to that PR and to the commit waiting to deploy. After you create it, the next attempt (within 2 minutes) deploys.

### Merge train: you approve, ADLC merges
When several agent PRs wait for your review (high risk, or overnight runs), merging one makes all the others stale, so each one needs updating and a new CI run before it can merge. With the merge train you only **review and approve**. The poller then merges the approved agent PRs **one after another**, in approval order. Low and medium risk PRs (the tiers in `autonomy.auto_merge`) need no approval: they join the train once their checks are green (in order of creation), and with the train on it takes them over from GitHub's auto-merge, so they get the same order and update rules:
- It brings the front PR up to date with its base and waits for green checks.
- Then it squash-merges it with the App. That's a normal merge: required checks and reviews apply, and the admin bypass is never used. Then the next PR moves up.

Conflicts and failed checks take the rework path above, with one exception: a PR **queued behind another** in the train isn't sent back for conflicts until it reaches the front, because the PRs ahead of it change `main` again when they merge (resolving now would mean resolving twice, and a re-approval each time). A PR that **needs your re-approval keeps its place**: the PRs behind it wait until you re-approve and it merges. Once a PR has used its automatic reworks (its issue is `adlc:needs-human-review`), no agent acts on it until you do: the train marks it **needs you** and lets the next approved PR go first. Fix it on the branch yourself, or relabel the issue `adlc:ready` for one more agent rework; then re-approve.

**Re-approval only when needed.** ADLC decides whether your approval still holds. It does when the PR **still makes the same change** you approved: the same lines added and removed compared with `main`, only carried onto a newer `main`, also through resolved conflicts (blank lines and `.adlc/` don't count). That's what lets approved PRs merge unattended while other issues keep landing. It also holds when every commit after the one you approved is a clean merge of the base branch or touches only ADLC's own run records under `.adlc/`. New code, or a resolution that changed the PR's own lines, makes it stale. ADLC then asks you on the PR to re-approve, with the lines of the PR's own change that differ and a link to all changes since, and turns off the PR's GitHub auto-merge until you have (GitHub itself would otherwise still count the old approval). If you merge a PR by hand, check that the train doesn't say "re-approve" for it. For this, the branch protection setting **"Dismiss stale pull request approvals when new commits are pushed" must be off**, or GitHub drops your approval on every update. To re-approve, submit another review with **Approve** (Files changed → Review changes → Approve): GitHub accepts it although your earlier approval still shows:

`gh api -X PATCH repos/<owner/repo>/branches/main/protection/required_pull_request_reviews -F dismiss_stale_reviews=false`

Below the changed lines, the re-approve comment also shows the **conflict resolutions** on their own: what the agent's merges of the base changed compared with git's own merge (`git show --remerge-diff`), usually a few lines. That's the part to check; the rest of a merge of the base needs no review. To keep your approval through changes in generated files, list them in `autonomy.reapprove_ignore` (globs, e.g. `[pnpm-lock.yaml]`; or `ADLC_REAPPROVE_IGNORE` in `/srv/adlc/config/<slug>.env`, space-separated). Default: none.

**Update before merge, or only on overlap** (`update_before_merge`, dashboard → Health → Automation or `adlc.yaml → autonomy`):
- `always` (default): a PR behind the base is updated with it and its checks run again before it merges. With branch protection's **"Require branches to be up to date before merging"** GitHub insists on that, so each merge makes every other approved PR wait a full CI run.
- `overlap`: a green PR behind the base merges as it is, unless the base changed, since the PR's checks started, a file the PR changes too, or a path in `autonomy.merge_train_always_update` (default `pnpm-lock.yaml package-lock.json yarn.lock *migrations/* .github/*`: they can break code without touching it; or `ADLC_TRAIN_ALWAYS_UPDATE`). Only those PRs are updated and re-checked. The train shows why ("changed on both: …"), or "none touching its changes" when it merged without an update.
  - Turn off "Require branches to be up to date before merging" on the base branch first (Settings → Branches; keep the required checks). While it's on, GitHub refuses those merges and the train falls back to updating (its log says so).
  - The same rule applies to keeping green PRs up to date (`keep_prs_current`).
  - Safety net: `main`'s own CI runs after every merge, and a failure there becomes a regression issue that runs first. A break between PRs that changed different files (e.g. one renames a function the other calls) shows up there, not on the PR. With the train on, low and medium risk PRs go through it too; with it off or in dry-run, GitHub's auto-merge merges them on green without this check.

**Taking a PR out of the train:** add `adlc:hold` to it, request changes, or remove your approval.

**Mode:** switch it live from the dashboard (a project's **Health** tab → **Automation**) or with `adlc train <slug> on|dry-run|off`. Neither takes a restart. You can also set a default in `adlc.yaml` (`autonomy.merge_train`) or as `ADLC_MERGE_TRAIN` in `/srv/adlc/config/<slug>.env`. The modes:
- `dry-run` (default): decides and reports, but merges nothing,
- `on`,
- `off`.

`adlc status` and the dashboard's **Needs you** tab show the train and anything waiting for your re-approval.
- Switch it off with `autonomy.ci_auto_rework: false` in `adlc.yaml`.

**Finishing open PRs before starting new ones.** Every merge can make the other open agent PRs conflict, and each conflict costs a delivery run. Two switches (dashboard → Health → Automation, or `adlc.yaml → autonomy`) keep the pile from growing:
- `rework_first` (default on): issues whose PR needs work (conflicts, failed checks, your review) run before new issues. The Queue tab marks them "rework".
- `max_open_prs` (default off; e.g. 3): no new issue starts while that many agent PRs are open, waiting for your review, a merge or a rework. Reworks still run. The Queue tab and `adlc status` say when new issues are held back.
- `update_before_merge` (default always): `overlap` merges green PRs that fell behind without another CI run when the base didn't touch what they change. See the merge train above.
- `verify_scope` (default affected; also auto and full): how much the agent's own verifies test. See **How much the agent tests** above.

### Risk tiers and merging
| Risk | Typical changes | Review | Merge |
|---|---|---|---|
| low | UI tweaks, small logic inside one module | Sonnet | automatic when CI is green (by the merge train when it's on) |
| medium | new endpoint, schema addition, cross-module refactor, native module | Opus | automatic when CI is green (by the merge train when it's on) |
| high | auth, payments, secrets, destructive migrations, CI/infra, new dependency, **any proposed ADR** | Opus + security | **you merge** |

Which tiers merge without your approval is set in `adlc.yaml → autonomy.auto_merge` (default `[low, medium]`). For that to work, GitHub mustn't require your review on every file: `CODEOWNERS` lists only `/.github/`, `/deploy/` and `/adlc.build.yaml` (no catch-all `/` entry) when "Require review from Code Owners" is on.

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

### Disk housekeeping
ADLC builds many images (every verify attempt rebuilds a run's images) and would fill the disk without cleanup. It cleans up after itself:
- **Every few hours** (`ADLC_HOUSEKEEP_HOURS`, default 6) the poller cleans the agents' Docker engine. It removes images no container uses, by how long ago they were last built, pulled or tagged:
  - images docker compose built (test environments, whatever the agents named them) after `ADLC_BUILT_IMAGE_MAX_IDLE_H` hours (default 6),
  - everything else after `ADLC_IMAGE_MAX_IDLE_H` (default 48).

  It also removes untagged images and caps the build cache at `ADLC_BUILD_CACHE_KEEP` (default 6 GB). Large images listed in `ADLC_KEEP_IMAGES` (default: the Android emulator, ~11 GB) are kept, and oversized component logs are trimmed. It also prunes the project clone's unreachable git objects (left by reworks and rebases; objects younger than an hour stay). Set these in `/srv/adlc/config/<slug>.env`.
- **After each dev deployment**, the dev environment's previous `sha-…` images are removed; the registry still has them.
- **After each run's issue closes**, its containers, volumes, built images and worktree are removed. That includes the test environments its task agents started (`adlc-<n>-t<k>`), and ones left behind after the worktree was already gone. The shared Android emulator (`adlc-emulator`) and the dev deployment stay.
- **CI engine, after every job:** the images that job built with docker compose are removed, and the build cache is capped at `ADLC_CI_BUILD_CACHE_KEEP` (default 4 GB). **Daily**, images no job used for `ADLC_CI_IMAGE_MAX_IDLE_H` hours (default 24) are removed, e.g. publish's local copies of pushed images. The runner images and `ADLC_KEEP_IMAGES` stay. The egress access log rotates at 50 MB.
- **CI build caches:** Gradle (`~/.gradle`) and the Android SDK/NDK (`~/.android`) live in two volumes in the CI engine that survive between jobs, so Android builds don't start from cold. Each is emptied by the daily housekeeping once it's above `ADLC_CI_CACHE_MAX_GB` (default 12). Every runner start rewrites `gradle.properties` and removes Gradle init scripts, so a job can't leave build settings for the next one.
- **After `adlc up` / `adlc ui up`**, the ADLC images they replaced are removed and the host build cache is capped (`ADLC_HOST_BUILD_CACHE`, default 4 GB).
- **Visibility:**
  - `adlc status` shows free space and one usage line per Docker engine (host, agents, CI): images, build cache and volumes, with what's reclaimable. It warns above `ADLC_DISK_WARN_PCT` (default 75%) used.
  - The dashboard shows the same warning, and the agents' engine usage on a project's Health tab.
- **Disk guard:** below `ADLC_MIN_FREE_GB` (default 15) free, the poller runs housekeeping first. If space is still low, it starts no new runs (logged once).
- Docker volumes and buildx builders that ADLC didn't create, such as other projects' or a `docker buildx create` builder, are never touched. Check them with `docker system df -v` and `docker buildx ls`.
- **Now:** `adlc prune [slug]` does all of the above immediately and prints free space before and after.

### Dashboard (`adlc ui`)
A web page for all projects on the dev server: what's running now with its **live log**, the queue in order of precedence, what **needs you** (PRs to review, blocked runs and questions, your next owner tasks), run history with duration and cost (plus the all-time and last-30-days total), component health and logs, each machine's **CPU, memory and disk** (the main host and any CI-only hosts), and **pause/resume**. It works on a phone.

```bash
adlc ui up                      # build and start it → http://adlc.<base>[:port]
adlc ui token                   # the login token (adlc ui token --rotate signs everyone out)
adlc ui up --host adlc.example.com   # later: also answer to a name your reverse proxy forwards
adlc ui host-token <host> [--rotate|--remove]   # a CI-only host's report token (see the CI-only host setup)
```
- **LAN only by default.** To reach it from outside, publish it through your own reverse proxy over **HTTPS**, with that proxy's authentication in front, and add the name with `--host`. The token login and `SameSite=Strict` cookies stay on (the cookie is marked `Secure` when the proxy forwards HTTPS).
- **Safe by construction:** the dashboard has no Docker socket and no GitHub or Claude credentials, and it reads project state and logs read-only. The only thing it accepts without a login is a CI-only host's stats report, checked against that host's own token and reduced to a few numbers. GitHub data comes from a snapshot the poller writes every minute. Pause and resume are requests the poller applies within a minute and logs.
- Update it after `git -C ~/adlc pull` with `adlc ui up`. The sidebar shows the ADLC commit it runs (**ADLC `<sha>`**, linked to GitHub), so you can see whether it's up to date.

| Situation | What you do |
|---|---|
| **`adlc:needs-info`** | Answer the questions in an issue comment, then relabel `adlc:ready` (or `adlc:queued` if it still has open blockers). The run resumes from where it stopped. |
| **`adlc:owner`** (your tasks) | Do the task (its commands are written to paste as they are, on the machine it names), check its acceptance criteria, close the issue. The issues it blocked start automatically. `adlc status <slug>` shows where each owner task sits in the queue and what it unblocks. |
| **`adlc:blocked`** | Read the summary comment (phase, reason, report paths). Fix the cause (clarify the issue, resolve a `tbd` setting, fix the environment), then relabel `adlc:ready`. Or open an interactive session and run `/adlc-core:deliver <n>` to work through it with Claude. |
| **High-risk PR** | Review it like any PR. The body shows the spec, risk reason, AC → test mapping and review verdicts. If it contains a **proposed ADR**, accepting the PR accepts the ADR (change its status to `accepted` before merging). |
| **An agent asks for a `tbd` setting** | `/adlc-core:init --update <section>`, then relabel the issue `adlc:ready`. |
| **Redo an issue from scratch** | Close its agent PR without merging (also when the issue is `adlc:blocked` or `adlc:needs-human-review` after a rework). The poller archives the branch as `adlc-closed/<n>-pr<PR>`, removes the workspace and puts the issue back to `queued`; the next run starts from the current `main`. To drop the issue instead, close the issue too. |
| **Triage new issues** | Open issues with no pipeline state don't start by themselves: flaky tests, regressions (`main` or the nightly is broken; one without a state is started automatically, once) and spikes the agents open, and **any issue opened without an ADLC label** (a follow-up an agent filed, an issue you or a Claude session opened by hand), shown as **no label**. Pinned issues are left out. The dashboard's **Needs you → New issues to triage** lists them: **Start** (into the queue: ready, or queued while it has open blockers) or **Run next** (first in line). Close them on GitHub to drop them. |
| **See what's happening now** | The dashboard's **Now** tab starts with **What's happening**: one row per issue in flight, joining its delivery run (phase, time), its merge-train status and detail, and its PR's CI jobs (running on which host, or waiting). Below: the next PRs in the train, CI not tied to an issue (`main` after a merge, release-please), the dev deploy when it's deploying or waiting (secrets, CI images, a failure), with a link to the publish run of that commit, and a running nightly. "agent: …" opens that run's card with the live log; issue and PR numbers open GitHub. |
| **See dependencies** | The dashboard's **Dependencies** tab draws the open issues and their "blocked by" relationships, left to right. Hover an issue to light up its chain; click it to see only what it waits for; filter by milestone. |
| **Change priorities** | **Run next** in the dashboard's Queue tab puts an issue that can start (ready, or queued with nothing blocking it) first in line: label `adlc:priority`, removed when its run starts; a running delivery isn't interrupted. **Run next on an epic** (Epics tab) puts its startable sub-issues (and those of its sub-epics) first, after single-issue Run next, until you undo it; dependencies and the open-PR limit still apply. **Regressions** (`adlc:regression`: `main` or the nightly is broken) go right after single-issue Run next, ahead of epics and milestones. The **Epics** tab shows every open epic with its progress (done, in flight, needs you, ready, queued) and, expanded, its sub-issues with their state, queue position, blockers and PR. For lasting changes to the product order, use `/adlc-core:plan-backlog --revise` (milestones and dependencies). Otherwise: milestone due dates, relabel issues, or `/adlc-core:plan-backlog --revise`. |
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
- **Only collaborators' issues and comments** are acted upon. An issue from anyone else (including the nightly workflow's regression reports, filed by `github-actions`) runs once a collaborator labels it `adlc:ready`; that approval holds through its reworks.
- **Humans approve** setup, architecture, and every high-risk change.

---

## 15. Stacks: what ADLC knows about your technology

The core pipeline (agents, labels, merge train, CI gate) knows nothing about any language or framework. What ADLC knows about **your** technology comes from **stacks**: one per technology, enabled per project in `adlc.yaml`:

```yaml
stacks: [react-native, node-api]   # react-native, react-web, node-api
platforms: [web, android, ios]     # which platforms the acceptance criteria and e2e tests cover
```

### What a stack brings
Each stack is up to four parts, matched by name. The project needs no other setting:

| Part | Where it lives | What it does | When it applies |
|---|---|---|---|
| **Skills** (conventions and templates) | `plugins/stack-<name>/skills/` | Every agent loads the skills that fit its task before it starts: the architect for the design, the test-designer for the tests, the implementer, reviewer and debugger for the code, QA for the e2e flows. Accepted ADRs override them. Templates give the walking skeleton its Dockerfiles, compose files, test environment and CI jobs. | The runner installs `stack-<name>` for each entry when it starts (`adlc up`, `adlc restart`). |
| **Runner image layer** (tools) | `sandbox/runner/stacks/<name>.Dockerfile` | Tools the agents need on the dev server beyond Node, pnpm, git and Docker: the Android SDK and Maestro for React Native, Playwright's system libraries for web. | Built on top of the base image by `adlc up <slug>`. |
| **Network allowlist** | `sandbox/egress/domains/<name>.txt` | The registries and download hosts this technology needs (npm, Maven, Expo, Playwright's CDNs…). Enforced only with `network.mode: allowlist`. | The egress proxy re-reads it within a minute of `adlc.yaml` changing on `main`. |
| **CI jobs** | a template in the stack's skills (e.g. `e2e.yml`) | The stack's end-to-end jobs (web, Android emulator, iOS on macOS), added to the project's workflows by `/adlc-core:init` and the walking skeleton. | Through the project's own workflows. |

A stack that has no pack (say `stacks: [go]`) is allowed: the runner logs "no stack pack for 'go' (agents rely on general knowledge for it)", and the agents work from the model's own knowledge and the project's ADRs.

### The stacks available

| Stack | For | Skills | Runner layer | Host needs |
|---|---|---|---|---|
| `react-native` | Expo apps on web, Android and iOS | `expo-app` (app layout, state, config, platforms, testIDs, offline, EAS) · `e2e-patterns` (Playwright for web, Maestro for Android on the shared emulator and iOS in CI) · `rn-test-env` (per-run test environment, watch and build modes, emulator, `adlc.build.yaml`, `e2e.yml`, walking-skeleton checklist) | JDK 17, Android SDK 35, Maestro, Playwright libraries | **x86_64** and **`/dev/kvm`** for the Android emulator (`adlc doctor` checks both); iOS e2e runs on GitHub's macOS runners |
| `react-web` | Desktop-first web apps (React + Vite SPA) | `vite-spa` (routing and data, forms, **shadcn/ui on Base UI + Tailwind v4**, runtime config, same-origin auth, i18n, a11y, performance budgets) · `web-containers` (vite dev and unprivileged nginx images, `/config.json`, CSP, `/api` through Traefik) · `web-testing` (Vitest + Testing Library, Playwright, axe) | Playwright libraries (browsers download per project) | none |
| `node-api` | Node.js/TypeScript APIs with Postgres and Redis | `node-api` (Fastify, zod, OpenAPI, errors, auth, config, logging, health, shutdown, rate limits) · `postgres-redis` (migrations, expand/contract, transactions, seeding, Redis with TTLs) · `node-containers` (Dockerfile, compose for test and dev, Swarm prod stack, pre-deploy migrations) | none (the base image has Node) | none |
| core (always) | every project | `ci-workflows` (CI from `adlc.build.yaml`, publish, nightly, release) · `testing-contract` (when tests run; stacks say how) | | |

Typical combinations: a mobile product with an API is `[react-native, node-api]` (the default); a web app with an API is `[react-web, node-api]`; a product with a mobile app and a separate desktop-first web app uses all three. Where `react-web` and `react-native` are both enabled, they share the Playwright conventions.

### Choosing and changing stacks
- **At setup:** `/adlc-core:init` asks for the platforms and stacks first (it offers every `stack-*` plugin in the ADLC marketplace, your organization's included), because they decide which setup questions apply (no mobile platform: no mobile section). It writes them to `adlc.yaml`, enables the matching plugins in the project's `.claude/settings.json` (so a local Claude Code session on a clone gets them too), and adds the stack's `e2e.yml`.
- **In the architecture:** `/adlc-core:architect` loads the enabled stacks' skills first, as the default conventions to design from, and confirms `stacks` and `platforms` at the end. A decision that departs from a stack's default (another UI kit, another ORM) becomes an ADR, which the agents then follow instead.
- **Later:** change `adlc.yaml → stacks` through a PR (or `/adlc-core:init --update`), merge it, then run `adlc up <slug>` on the dev server: it rebuilds the runner image with the new layers and installs the new plugins. The egress allowlist follows by itself. `adlc restart` alone installs plugins but doesn't rebuild the image. `adlc up <slug> --stacks a,b` builds other layers for one run without changing `adlc.yaml`, e.g. to try a stack out.
- **Check it:** `docker logs adlc-<slug>-runner-1 2>&1 | grep "stack pack"` lists the packs the runner installed.

### Adding a stack
Stacks are usually how an organization teaches ADLC **its own** conventions for a kind of application: its libraries, layout, security and logging rules, base images, registries and review checklist. Keep such stacks in your organization's fork of ADLC (private, if the conventions are internal); the dev servers run that fork.

**Let Claude write it:** in a Claude Code session on your ADLC checkout, ask *"Create a stack for our Spring Boot services; our reference repo is …"*. Claude follows [`docs/stacks/README.md`](docs/stacks/README.md): it interviews you, reads the reference repository, writes the skills, templates, tool layer and network list, and registers the stack.

By hand: a stack is a plugin in this repository's marketplace, plus optional files picked up by name. For a new technology, say `go-api`:

1. **The plugin:** `plugins/stack-go-api/.claude-plugin/plugin.json` (`name`, `version`, `description`) and one folder per skill under `skills/`. Each `SKILL.md` starts with a `name` and a `description` that says when to load it ("Load before designing, implementing, reviewing or debugging Go API code"). Keep skills to conventions the agents can act on: layout, patterns, testing, how the test environment is built, a review checklist. Say that accepted ADRs override them.
2. **Templates** (optional) in `skills/<skill>/templates/`: the files the walking skeleton copies: Dockerfile, compose files for the per-run test environment (follow `stack-react-native:rn-test-env`: no host ports, `${ADLC_RUN}` names, Traefik routing) and the stack's e2e workflow jobs.
3. **The marketplace:** add the plugin to `.claude-plugin/marketplace.json`.
4. **Tools** (optional): `sandbox/runner/stacks/go-api.Dockerfile`, starting with `ARG BASE` / `FROM ${BASE}` and `LABEL org.adlc.managed="true"` (so housekeeping recognises the image), installing as root and switching back to the `adlc` user (see `react-native.Dockerfile`).
5. **Network** (optional): `sandbox/egress/domains/go-api.txt`, one domain per line (`.example.com` covers subdomains).
6. **Setup questions** (optional): `skills/go-api-setup/SKILL.md` with extra rows in the project-setup table format; `/adlc-core:init` asks them after the core sections.
7. **Document it** in the tables above. `/adlc-core:init` offers every `stack-*` plugin in the marketplace, with its description, so a new stack shows up there by itself. Bump the plugin's version whenever its skills change, so runners pick up the update on `adlc restart`.

`bin/adlc`, the runner and the egress proxy find the parts by file name, so nothing else changes.

---

## 16. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Issue never starts | It's `adlc:queued` (blockers still open), or its author isn't a collaborator (`adlc:needs-human-review`), or the poller is paused or out of quota. |
| Runs hit usage limits | All agents share your plan's quota. Lower `ADLC_MAX_PARALLEL_RUNS`. The poller backs off and retries automatically. |
| `adlc:blocked` with "environmental" | Sidecar down, emulator missing (`/dev/kvm`), or a domain blocked by the network allowlist. Check the run's `reports/` and the proxy audit log. |
| Agent blocked on a `tbd` key | `/adlc-core:init --update <section>`, then relabel `adlc:ready`. |
| Agent blocked because the issue needs `docs/project/setup.md`, `CLAUDE.md` or `adlc.yaml` changed | Those are the project's setup record: only you change them, with `/adlc-core:init --update <section>` in an interactive session (the blocked comment names the section, e.g. `secrets` for secret file locations and modes). Merge its PR, then relabel the issue `adlc:ready`; the agent does the rest. |
| Plugins not loaded | `claude plugin validate`, check `.claude/settings.json`, and trust the folder in an interactive session once. On the runner, `adlc up <slug>` re-installs them. |
| Poller log says GitHub rejects the token | PAT expired or missing a permission: `adlc secrets <slug>` then `adlc up <slug>`. |
| A build in a run fails to download something | The domain is blocked in allowlist mode: `adlc audit <slug>`, add it to `adlc.yaml → network.extra_domains`. |
| Services in a test environment can't reach each other (HTTP 403) | The service lacks `NO_PROXY: "*"`. See the networking rules in the testing contract. |
| Preview URLs (`*.<slug>.<ip>.nip.io`) don't open, or tests in the runner can't reach them | Your router or DNS filter has DNS-rebind protection and drops public answers that point to private IPs. Either allow `nip.io` there, or use your own wildcard record (e.g. `*.dev.example.com → <dev-server IP>`) and `adlc up <slug> --domain dev.example.com`. Check with `getent hosts app.<slug>.<base>` on the dev server. |
| `adlc up` warns "edge proxy could not start on port 80" | Another service uses port 80: `adlc up <slug> --edge-port 8088` (stored for all projects). Preview URLs then end in `:8088`. |
| Claude app: session stuck on "Connecting" / "Can't reach adlc-<slug>" after `adlc up` | Each runner restart creates a **new** Remote Control environment; old sessions don't reconnect. Start a new session on the online **adlc-<slug>** environment (or open the link shown in `adlc attach <slug>` → window rc). Right after a restart, rc may report "folder already served" for ~3 minutes until the old registration expires; it recovers by itself. Wait for **`Ready`** (not `Connected`: that appears only after the app sends a message). |
| Preview URL returns 404 | The service isn't on the `adlc-web` network or lacks Traefik labels; check with `adlc attach` → shell → `docker ps`. |

### What to do when…
Situations from real projects, with the steps that resolve them. The [Field Guide](ui/web/public/guide/index.html) (dashboard → **Guide** → *Fix it*) has the same list, searchable.

**Pipeline**
- **An owner task's command fails with "No such file or directory" for `/projects/<slug>/…`.** It was written with `$ADLC_ROOT`, which exists only inside the runner; in your shell it is empty. Agents before adlc-core 0.1.42 wrote it that way. Replace `$ADLC_ROOT` with your ADLC root (`/srv/adlc` by default), e.g. `f=/srv/adlc/projects/<slug>/secrets/dev/<name>`, run the command with `"$f"`, then `ls -l "$f"` (mode `-r--r--r--`, not empty). For a missing dev secret, `adlc status <slug>` also prints a create command with the full path. Current agents write owner tasks with absolute paths, ready to paste.
- **An issue doesn't start after you answered its question.** Removing `adlc:needs-info` leaves it with no pipeline state, and the poller only starts `adlc:ready` (or `adlc:queued` once its blockers close). Relabel it: `gh issue edit <n> --add-label adlc:ready`, or **Start** on the dashboard's Needs you tab. The run resumes where it stopped, with your answer.
- **An issue starts before its planned turn.** Only GitHub's **blocked by** relationships hold an issue back. An order written in a comment or `backlog.md` (e.g. "after #180") isn't read by the poller. Add the relationship on the issue (Relationships → *Mark as blocked by*), or use `/adlc-core:plan-backlog --revise`.
- **A regression waits behind other work.** Regressions (`adlc:regression`) run right after Run next, and one opened without a state (e.g. by a nightly script that adds only `adlc:regression`) is started automatically, once. On an older runner image, press **Run next** on it, and update the runner (`adlc up <slug>`).
- **An issue stays `adlc:blocked` or `adlc:needs-human-review` after you closed its PR.** Closing an agent PR without merging archives the branch as `adlc-closed/<n>-pr<PR>`, removes the workspace and puts the issue back to `adlc:queued`. If that didn't happen, the runner image predates it: relabel the issue `adlc:queued` and update the runner.
- **A run ends with "the delivery run ended unexpectedly (exit 124)".** Exit 124 means the run reached its time limit, `ADLC_RUN_TIMEOUT` (default `4h`), and was stopped; the issue is `adlc:blocked`. Everything it committed is pushed and `state.json` records the phase, so relabelling `adlc:ready` resumes from there. For a project with large issues raise the limit: `echo 'ADLC_RUN_TIMEOUT=6h' >>/srv/adlc/config/<slug>.env && adlc up <slug>` (a `timeout` duration: `6h`, `360m`). Smaller issues are the better long-term fix. Older runner images ignored this setting; the same goes for `ADLC_POLL_INTERVAL`, `ADLC_DEPLOY_INTERVAL`, `ADLC_LOG_RETENTION_DAYS` and `ADLC_CI_REWORK_MAX`.
- **The dev server is busy and you want to know which container.** The host's `docker stats` shows only the engines: the agents' (`adlc-<slug>-docker-1`) and the CI ones (`adlc-<slug>-ci-docker-*`). Look inside: `docker exec adlc-<slug>-docker-1 docker stats --no-stream`. There `adlc-<n>-*` is issue n's run, `<slug>-dev-*` the dev deployment and `adlc-emulator` the shared Android emulator, which stays up on purpose (about 20% of a core when idle; `docker exec adlc-<slug>-docker-1 docker compose -p adlc-emulator down` stops it until the next Android test). A closed issue's test environments, including task agents' `adlc-<n>-t<k>`, are removed within about 10 minutes; older runner images missed the task ones (update the runner, or `docker compose -p <project> down -v` inside the engine).
- **Health shows Remote Control "login required".** Only the interactive sessions (Remote Control, the Claude app) are affected. Unattended deliveries use the `claude_oauth_token` secret and keep running. Log in again with `adlc login <slug>`.
- **The Claude app can't reconnect after a restart.** See the table above: start a new session on the online **adlc-<slug>** environment.
- **Android e2e: the app shows "offline" or can't resolve the API host, or the emulator stays unhealthy.** Two causes, both in the environment, not the app. (1) The emulator sends the device's connections through ADLC's egress proxy, which refuses the per-run hosts (`HTTP proxy handshake … 403` in its log): ADLC's Docker injects `HTTP(S)_PROXY` into every container and the emulator ignores `NO_PROXY`. The project's `deploy/compose.emulator.yml` must set `HTTP_PROXY`, `http_proxy`, `HTTPS_PROXY` and `https_proxy` to `""` (stack-react-native 0.1.11 template). (2) A *restarted* emulator container can't start the device again (`sudo chown … /dev/kvm` fails): recreate it instead, `docker exec adlc-<slug>-runner-1 bash -lc 'cd /srv/adlc/projects/<slug>/repo && ADLC_PROJECT_DOMAIN=<slug>.<base domain> flock "$ADLC_LOCK_DIR/android-emulator.lock" docker compose -p adlc-emulator -f deploy/compose.emulator.yml up -d --force-recreate --wait'`.

**PRs and merging**
- **Every conflict rework asks you to re-approve, so approved PRs don't merge overnight while other issues land.** Runners before 2026-11-10 treated any conflict resolution as new code, and ran a full rework (about 35 minutes) for it. Current ones keep your approval while the PR still makes the same change (the comment shows the lines that differ when it doesn't), run a quick rework for conflicts only, and count conflicts apart (`autonomy.conflict_rework_max`, default 5). Update the runner (`adlc up <slug>`) and the plugins (`adlc restart <slug>`). A PR that is `adlc:needs-human-review` because of the old shared limit: relabel its issue `adlc:ready`.
- **A PR asks you to re-approve, though GitHub still shows your approval.** ADLC checks every commit after the one you approved. Clean merges of the base and commits touching only `.adlc/` keep the approval; anything else (new code, a conflict resolution) makes it stale. Open the compare link in ADLC's comment, review it, then **Review changes → Approve** again.
- **An approved PR conflicts and stays in the merge train ("needs you", or every later PR "waits for #N").** The PR used up its automatic reworks (the PR says "Leaving it to a person"; the issue is `adlc:needs-human-review`). Relabel the issue for one more agent rework: `gh issue edit <n> -R <owner/repo> --remove-label adlc:needs-human-review,adlc:blocked,adlc:pr-open --add-label adlc:ready`, or resolve it on the branch yourself. Then re-approve the PR. Runner images before "needs you" keep such a PR at the front, so the later PRs wait too: `adlc up <slug>`.
- **The merge train's front PR says "the agent resolves them" (or "the agent reworks it"), but nothing runs and the PRs behind it wait.** Its automatic reworks are used up but its issue never got `adlc:needs-human-review` (the relabel failed, e.g. during a GitHub outage; older runners didn't retry it). Runners from 2026-11-04 retry the relabel and treat a used-up rework counter as "needs you", so later PRs go ahead. By hand: add `adlc:needs-human-review` to the issue (the train then shows it as "needs you" and moves on), or relabel it `adlc:ready` for one more agent rework.
- **You relabelled an issue `adlc:ready` for one more rework, but the train still says "reworks used up".** Runners before 2026-11-04 (afternoon) went by the rework counter alone. Current ones show the PR as "the agent resolves them" (or "reworks it") while the issue is `adlc:ready`, queued or being delivered. Either way the rework runs: the issue shows on Now once a slot is free.
- **The train says a PR's checks failed and "the agent reworks it", but its issue is `adlc:blocked`.** A rework found nothing to fix, usually because only a flaky test failed, and blocked the issue; its comment says which check to re-run. Runners from 2026-11-05 show such a PR as "needs you" with that advice, and later PRs go ahead. Re-run the failed jobs (`gh run rerun <run> --failed`); if they pass, the train merges it. Relabel the issue `adlc:ready` if you want the agent to try again.
- **The poller log fills with "There are too many unreachable loose objects; run 'git prune'".** Git's automatic cleanup of the project clone failed once and left `.git/gc.log`; git then skips it and warns on every fetch. Housekeeping (from 2026-11-05) removes `gc.log` and prunes the clone. By hand: `rm /srv/adlc/projects/<slug>/repo/.git/gc.log && git -C /srv/adlc/projects/<slug>/repo gc --prune=1.hour.ago`.
- **The train shows a PR as "blocked: GitHub refused the merge", but the PR is merged.** GitHub merged it and still answered the merge call with an error (seen during GitHub incidents). The card disappears on the train's next pass; current runners check the PR's state after an error and record it as merged.
- **Dev stays on an old version: "waiting for CI to publish sha-…", and Now says GitHub has no publish run for it.** No workflow ran for that push to `main`: GitHub dropped the push event (seen during its incidents), so the images are never built. GitHub sometimes delivers it late. Otherwise push a new commit to `main` (the next merge does it too), or add `workflow_dispatch:` to the publish workflow's `on:` through a project issue and start it from the Actions tab.
- **Approved PRs merge slowly: after each merge, every other one is updated and waits for a full CI run.** That's branch protection's "Require branches to be up to date before merging". Turn it off on `main` (Settings → Branches; keep the required checks), then set **Update before merge** to "only on overlap" (Health → Automation, or `autonomy.update_before_merge: overlap` in `adlc.yaml`). Green PRs then merge without an update unless `main` changed files they change too, or lockfiles, migrations or CI config.
- **Issues take hours, mostly in Verify: the agent runs the whole test suite again and again, and debugs failures in tests the change never touched.** That's `verify_scope: full`. Switch it to `affected` (Health → Automation → Tests during delivery): the agent then tests what the branch affects, retries a failure in an untouched test file once and reports it as flaky, and leaves the full suite to the PR's CI. Keep a risky issue on the full suite with the label `adlc:verify-full`.
- **An approved, green PR is behind `main` and never merges.** The merge train only reports in `dry-run` (the default). Switch it on: `adlc train <slug> on` (or Health → Automation). It then updates the branch, waits for the checks and squash-merges, one PR at a time.
- **A blocked PR gets merge conflicts, or a rework just repeats an earlier conclusion.** The poller sends a conflicting PR back to the agent even when its issue is `adlc:blocked`, and the run gets `--conflicts` and must read the current PR state and new comments on the issue **and** the PR. If a run still misses it, relabel the issue `adlc:pr-open` (the poller then posts its conflict comment and starts a rework), or write the request on the PR and relabel `adlc:ready`. A conflict resolution makes your approval stale: re-approve afterwards.
- **A required check fails on a PR that didn't touch that code.** Usually a flaky test (e.g. a UI test waiting 1 s for data on a loaded runner). Re-run the failed jobs: `gh run rerun <run-id> --failed`. Open an issue labelled `adlc:flaky` with the failing test and log so it gets fixed for good.

**CI**
- **Many CI jobs wait, none seem to run.** Runners are single-use: between two jobs there is a 20–90 s gap while a new one registers, so a snapshot can show none. Check the dashboard's CI tab or `adlc logs <slug> ci`. A host runs as many test jobs at once as its slots allow (`adlc doctor` shows "up to N test job(s) at once"). If the queue really is longer than your capacity, add a CI host or raise its slots (next item).
- **CI tests time out (5 s limits, "completes in < 2 s") on PRs, but pass on a rerun or locally.** The job ran on the main host while an agent's delivery run used the CPU. Check the job's runner name: `adlc-<slug>-test-…` (no host) is the main host. With a CI-only host, take `test` off the main host (`adlc up <slug> --ci-roles publish`) and give the CI-only host room for Android and a test job (`ADLC_CI_SLOTS=3` there). Then re-run the failed jobs.
- **A CI host sits idle while test jobs wait.** CI capacity is `ADLC_CI_SLOTS` per host (default 2; `adlc doctor` on that host shows it). An Android (`kvm`) job takes 2, so while one runs or waits, that host's test runner holds back (its log says "waiting: running CI jobs use the capacity"). On a host with 4+ CPUs: `echo 'ADLC_CI_SLOTS=3' >>/srv/adlc/config/<slug>.env && adlc up <slug>` on that host.
- **Publish fails with "findings at or above CRITICAL, or the scan failed".** Read the scan's `Total:` lines first. `CRITICAL: 0` plus `FATAL … failed to download vulnerability DB` means Trivy's database mirror failed: re-run the failed job. Real CRITICAL findings need a newer base image or package upgrade in the Dockerfile: open an issue for it.

**Dashboard and access**
- **The dashboard lacks something new, or the dev server seems to run old code.** `adlc restart` reloads only the plugins; the poller, queue, merge train and CI registrar are built into the runner image. `adlc doctor` says whether each runner's image is older than your checkout. To update: `adlc pause <slug>`, wait until `adlc status <slug>` shows no active run, then `cd ~/adlc && git pull && adlc up <slug> && adlc ui up && adlc resume <slug>`. A CI-only host needs `git pull && adlc up <slug>` too (its roles are remembered).
- **A CI host is missing from Machines, or its tile says "No report".** The main host is sampled by the dashboard; a CI-only host shows up only once linked, and dims after 3 minutes without a report. On the CI host, `adlc logs <slug> hoststats`: 200 is fine, 401 means a wrong or rotated token (`adlc ui host-token <host>` on the main host, then `adlc ui report <url>` again), 000 means it can't reach the dashboard URL.
- **The dashboard opens in Chrome but not in Safari (or not on another device).** DNS-rebind protection in your router (e.g. pfSense) drops `nip.io` answers that point to private IPs; Chrome's secure DNS bypasses the router, Safari uses it. Allow `nip.io` as a private domain in the router, or use your own name (`adlc ui up --host adlc.example.com`). Then flush the Mac's DNS cache: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`.
- **After changing `stacks`, the agents lack a tool (no Android SDK, no Playwright libraries) or a stack's conventions.** The runner image and its plugins only follow `adlc.yaml` when the runner is rebuilt. Merge the change to `main`, then `adlc up <slug>` (between deliveries: `adlc pause <slug>` first). `docker logs adlc-<slug>-runner-1 2>&1 | grep "stack pack"` shows which packs it installed; "no stack pack for '<name>'" means there's none for that name (check the spelling against [§15](#15-stacks-what-adlc-knows-about-your-technology)).
- **The agents keep using a stack's default where your project decided otherwise** (another UI kit, ORM or test runner). Stack skills are defaults; accepted ADRs override them. Record the decision as an ADR (`/adlc-core:architect`, or a PR adding it under `docs/architecture/adr/` with status `accepted`), and the agents follow it from the next run.
- **Two approved PRs were both reworked for conflicts, and now one needs re-approval while the other is reworked again.** Runners before 2026-11-10 sent every conflicting agent PR back to the agent at once, and let the next PR go ahead of one waiting for re-approval. Current runners rework a queued PR only once it reaches the front, and keep a PR that needs re-approval at the front. Re-approve the front PR; the others follow one by one.

---

## 17. Repository layout

```
adlc/
├── LICENSE                             Apache License 2.0
├── .claude-plugin/marketplace.json     this repo is a Claude Code plugin marketplace
├── plugins/stack-react-native/         Expo app, e2e, test-environment skills + templates
├── plugins/stack-react-web/            React + Vite SPA, shadcn/ui (Base UI), nginx image, Vitest/Playwright
├── plugins/stack-node-api/             Node API, Postgres/Redis, containers + Swarm templates
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
│   ├── edge/                           host-level Traefik for preview URLs
│   └── swarm/adlc-swarm-deploy         human-run production deploys on the Swarm manager
├── bin/adlc                            host CLI: doctor, secrets, up, login, attach, status, pause, logs, audit, down
├── docs/architecture.md                design of ADLC itself
├── docs/stacks/README.md               instructions for Claude to create a stack (an organization's conventions)
└── docs/video/                         builds the video tutorial (narration, scenes, dashboard screenshots)
```

## 18. License, support and contributing

ADLC is licensed under the [Apache License 2.0](LICENSE). You may use, change and redistribute it, also commercially, provided you keep the copyright and licence notices and mark the files you changed. The licence includes a patent grant from contributors and doesn't grant use of the ADLC name. Projects that ADLC delivers (your application code) aren't covered by it: they stay under whatever licence you choose.

- **Questions and bugs:** open an issue on [kororos/adlc](https://github.com/kororos/adlc/issues), with the output of `adlc doctor` and the relevant `adlc logs` lines. Remove tokens, hostnames and anything else private first.
- **Security problems** (a way for agent-written code to reach secrets, production or the host; a hole in the egress proxy or the guard hook): report them privately through the repository's **Security → Report a vulnerability**, not in a public issue. [§14](#14-safety-model) describes what ADLC protects against.
- **Contributions:** pull requests are welcome under the Apache License 2.0. Every change updates the docs with it: this README (the feature's section, the command table, §16) and the Field Guide (`ui/web/public/guide/`), as `CLAUDE.md` describes. A new stack (e.g. ESP32) is a plugin: see [§15](#15-stacks-what-adlc-knows-about-your-technology).
