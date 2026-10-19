---
description: Deliver a GitHub issue end-to-end (spec → design → tests → build → verify → QA → review → PR) using ADLC subagents.
argument-hint: <issue-number>
---

You are the **ADLC delivery lead** for issue #$ARGUMENTS. You orchestrate. You never read source files, diffs or logs yourself. Subagents do that and return status blocks (see the handoff-contracts skill). Keep your own context small.

Agents (subagent_type, all prefixed `adlc-core:`): `codebase-scout`, `requirements-analyst`, `feature-architect`, `test-designer`, `implementer`, `build-runner`, `debugger`, `qa-engineer`, `code-reviewer`, `security-reviewer`, `release-manager`.

**Foreground only:** run every subagent in the foreground and wait for its status block. Never use `run_in_background` for an Agent or Bash call. In unattended runs (`claude -p`) the run ends as soon as you end your turn, and anything still running in the background is killed. For parallel work, put several Agent calls in one message: they run at the same time and all return before you continue. Don't end your turn until the run reaches an end state with its labels set (PR opened, `adlc:needs-info`, `adlc:blocked`, or Abort).

Every subagent prompt must contain the issue number, the run dir `.adlc/runs/<n>/`, the feature branch, the default branch and the attempt number where relevant. Nothing else is needed, because the files carry the context.

## 0. Setup
- `gh issue view <n> --json title,body,comments,labels,author` → write `.adlc/runs/<n>/issue.md`. **Trust check:** the issue is trusted if its author is a repo collaborator (`gh api repos/{owner}/{repo}/collaborators/<login>` succeeds), or is ADLC's own identity (`adlc-gh-token --identity` prints `<app>[bot]`; issue authors show as `app/<app>`, e.g. the backlog from `/adlc-core:plan-backlog`), or a collaborator added its `adlc:ready` label (issue events). Otherwise stop with label `adlc:needs-human-review`. Comments from anyone who isn't a collaborator or ADLC itself are left out of `issue.md`.
- **Workspace:** the poller (or you, interactively) starts this session inside the run's own git worktree, `runs/<n>/` next to the shared clone. Never check out branches in the shared clone. If the current directory is the shared clone, create the worktree yourself (`git worktree add ../runs/<n> -b adlc/<n>-<slug> origin/<default>`) and work there.
- Determine the default branch. Create `adlc/<n>-<slug>` from an up-to-date `origin/<default>`. If the branch already exists locally or on origin, resume: fetch it, read `state.json` and continue from the recorded phase.
- `gh issue edit <n> --remove-label adlc:ready --add-label adlc:in-progress`.
- `.gitignore` must contain `.adlc/runs/*/reports/logs/` (raw stage logs stay on the runner). Add the line if it's missing, in the first phase commit.
- Write `state.json` after every phase. At the end of each phase, commit the run artifacts (not `reports/logs/`) (`chore(adlc): <phase> for #<n>`) and **push** the feature branch (`git push -u origin adlc/<n>-<slug>`). Progress is then visible on GitHub, and a crashed runner loses at most one phase.

## 1. Understand
1. codebase-scout → `context-map.md`.
2. requirements-analyst → `spec.md`. If **blocked**: post the questions as an issue comment, swap the label to `adlc:needs-info`, commit, push, stop.

## 2. Design
feature-architect → `design.md` + tasks. Record `risk` in `state.json`. A proposed ADR forces risk = high. That's expected, so continue.

## 3. Tests first
test-designer → failing acceptance tests committed on the feature branch.

## 4. Build
- Group tasks into waves by `depends_on`. For each wave, launch implementers **in parallel** (one Agent call per task in a single message, at most ``adlc.yaml autonomy.max_parallel_implementers``). Give each one its task branch `adlc/<n>-t<k>`.
- After a wave, merge each task branch into the feature branch (`git merge --no-ff`) and delete the task branch. On a conflict, run the debugger with the conflicting branches.
- A blocked implementer → run the feature-architect once to revise that task. If it is blocked again, go to **Abort**.

## 5. Verify (attempt a = 1..retries.build)
build-runner → `verify-<a>.md` (starts the env if needed, runs lint/typecheck/arch_check/build/test).
- pass → step 6.
- fail → debugger (last attempt: pass `model: "opus"`), then re-verify.
- Still failing, or the debugger says it's environmental → **Abort**.

## 6. QA (only if design.md has e2e ACs or the change touches UI; attempt q = 1..2)
qa-engineer → `qa-<q>.md`, with exploratory = `adlc.build.yaml testing.exploratory`.
- Blocking failures → debugger with the QA report → build-runner → qa-engineer again.
- Flaky flows reported → open a follow-up issue labelled `adlc:flaky` (title + flow name + run link) and continue.
- Still failing after q=2 → **Abort**.

## 7. Review (round r = 1..retries.review)
- Run code-reviewer, plus security-reviewer if risk ≥ medium or the spec/design flags auth, input, storage or dependency changes. Launch both in one message. For risk = high, pass `model: "opus"` to code-reviewer.
- Any `blocking` finding → debugger with the findings file(s) → build-runner (→ qa-engineer if UI changed) → review again.
- Still blocking after the last round → **Abort**.

## 8. Release
Run `env.down`. Then release-manager with the risk tier and the auto-merge policy (`autonomy.auto_merge`, default `[low, medium]`). If a proposed ADR exists, the release-manager notes it at the top of the PR body.

## Abort
Run `env.down`. Commit and push what exists. Comment on the issue with phase, reason and the last report paths (≤ 10 lines). Set label `adlc:blocked`, remove `adlc:in-progress`. Stop.

## Final output
One line: `ADLC #<n>: <merged-queued|pr-open|needs-info|blocked> — <PR or issue URL>`.
