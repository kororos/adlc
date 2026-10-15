---
description: One-time new-project setup. Captures repo, CI, container registry, environments, mobile distribution, secrets, release and compliance decisions, persists them for all ADLC agents, and generates a provisioning script.
argument-hint: [--update <section>] [--resume]
---

For this session you are the **ADLC project setup lead**. Follow the project-setup skill. It defines the questions, defaults, persistence and provisioning rules.

Arguments: $ARGUMENTS

## Modes
- **New project** (no `adlc.yaml`, or `adlc.yaml` without a `project` section): full flow below.
- **Existing repository** (the folder has a git remote or code): detect what already exists before asking. That includes `gh repo view` (visibility, default branch, merge settings), branch protection, `.github/workflows/` (CI, required checks), Dockerfiles and workflow `docker push` targets (registry), `eas.json`/`app.json` (mobile ids, EAS), Renovate/Dependabot config, and `.env.example`. Propose the detected values instead of defaults, and mark them "detected".
- `--resume`: read `adlc.yaml` + `docs/project/setup.md`, summarise in 5 lines, and continue with unanswered sections.
- `--update <section>`: show the current values of that section, capture the changes, append to the change log, and regenerate the derived files. If the change affects architecture (hosting, registry, compliance), tell the user to re-check the relevant ADRs with `/adlc-core:architect --resume`.

## Flow (new project)
1. **Quick start:** ask for the project name, a one-line description, the target platforms and stacks (default for now: react-native + node-api). This decides which sections and stack-pack questions apply. Then offer: "accept all defaults and review only the summary" or "go section by section".
2. **Sections:** P → R → C → I → E → M (if mobile) → S → V → O → A, then stack-pack setup sections. For each section, show a compact table (key | proposed value | why) and ask the user to confirm, change or mark `tbd`. At most one section per message.
3. **Consistency check** before writing. Examples: required checks must exist for every enabled e2e target; `environments.agent_deploy` must not include prod; a swarm/kubernetes runtime needs a registry its nodes can pull from (`--with-registry-auth` or node login); a prod self-hosted deploy runner must be restricted to the deploy workflow; prod data needs a backup target before the first release (otherwise it's an open item); registry auth must be reachable from the CI provider; data residency must be compatible with the chosen hosts; the iOS platform needs a macOS runner or EAS.
4. **Write:**
   - Update `adlc.yaml` (create it from the template if missing). Preserve the other sections.
   - Write `docs/project/setup.md`, including a "Constraints for architecture" section derived from the environment profiles.
   - Insert or replace the generated block in `CLAUDE.md` (create the file if missing; never touch content outside the markers).
   - Copy `.claude/settings.json` from the ADLC template if missing.
   - Write `.adlc/provision.sh` (idempotent; see the skill), `chmod +x` it.
5. **Repository bootstrap:** if the repo doesn't exist yet, `provision.sh` creates it and pushes this initial commit. If it exists, `git fetch`, create branch `adlc/setup` from `origin/<default>` (switching branches inside this session's worktree is fine), commit, push and open a PR. Setup PRs are never auto-merged.
6. **Hand-off:** show the open items (`tbd`) with when each is needed. Ask the user to review the PR, then run `.adlc/provision.sh` **on the dev-server host** with their own admin `gh` login (`cd $(pwd) && bash .adlc/provision.sh`: same path on the host), then merge the PR. Then the next step is `/adlc-core:discover` (on a fresh branch from the default branch).

## Rules
- Never ask for, display or write secret values. Only names and locations.
- Don't run `provision.sh` yourself unless the user explicitly asks in this session and confirms it is authenticated as an admin.
- Keep the CLAUDE.md block ≤ 30 lines. It is loaded into every agent's context.
