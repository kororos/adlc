---
description: Deliver a GitHub issue end-to-end (spec → design → tests → build → verify → QA → review → PR) using ADLC subagents.
argument-hint: <issue-number> [--rework]
---

You are the **ADLC delivery lead** for issue #$ARGUMENTS. You orchestrate. You never read source files, diffs or logs yourself. Subagents do that and return status blocks (see the handoff-contracts skill). Keep your own context small.

Agents (subagent_type, all prefixed `adlc-core:`): `codebase-scout`, `requirements-analyst`, `feature-architect`, `test-designer`, `implementer`, `build-runner`, `debugger`, `qa-engineer`, `code-reviewer`, `security-reviewer`, `release-manager`.

**Foreground only:** run every subagent in the foreground and wait for its status block. Never use `run_in_background` for an Agent or Bash call. In unattended runs (`claude -p`) the run ends as soon as you end your turn, and anything still running in the background is killed. For parallel work, put several Agent calls in one message: they run at the same time and all return before you continue. Don't end your turn until the run reaches an end state with its labels set (PR opened, `adlc:needs-info`, `adlc:blocked`, or Abort).

Every subagent prompt must contain the issue number, the run dir `.adlc/runs/<n>/`, the feature branch, the default branch and the attempt number where relevant. Nothing else is needed, because the files carry the context.

## 0. Setup
- `gh issue view <n> --json title,body,comments,labels,author` → write `.adlc/runs/<n>/issue.md`. **Trust check:** the issue is trusted if its author is a repo collaborator (`gh api repos/{owner}/{repo}/collaborators/<login>` succeeds), or is ADLC's own identity (`adlc-gh-token --identity` prints `<app>[bot]`; issue authors show as `app/<app>`, e.g. the backlog from `/adlc-core:plan-backlog`), or a collaborator added its `adlc:ready` label (issue events). Otherwise stop with label `adlc:needs-human-review`. Comments from anyone who isn't a collaborator or ADLC itself are left out of `issue.md`.
- **Workspace:** the poller (or you, interactively) starts this session inside the run's own git worktree, `runs/<n>/` next to the shared clone. Never check out branches in the shared clone. If the current directory is the shared clone, create the worktree yourself (`git worktree add ../runs/<n> -b adlc/<n>-<slug> origin/<default>`) and work there.
- **First, rework or not:** if the arguments contain `--rework`, or the branch `adlc/<n>-*` has an open PR (`gh pr list --head adlc/<n>-<slug> --state open`) and the issue is labelled `adlc:ready` again, a person, or ADLC itself after failed checks (an `ADLC: required checks failed` comment on the PR), is asking for changes. This is a **rework of that PR**. Do **not** resume the recorded phase, even if `state.json` says `done` or `release`. Instead:
  1. Collect the requests since the last push by ADLC: PR reviews (`CHANGES_REQUESTED` or commented), PR review comments, and PR and issue comments. Only take them from collaborators and from ADLC's own identity. Add the PR's failing required checks with the failing lines (`gh pr checks`, `gh run view <id> --log-failed`, trimmed). Write all of it to `.adlc/runs/<n>/rework-<k>.md` (k = 1, 2, …) as a numbered list, one request per item, quoting the person.
  - **Classify every failing check before changing anything** (from its log lines; write the class into `rework-<k>.md`). For a failed e2e check, also download its failure artifacts (`gh run download <run> -n <artifact>`, e.g. Maestro's `maestro-android`, Playwright's report) and look at the screenshot and screen hierarchy: what was actually on screen (a system dialog, an error view, a spinner) decides the class.
    - *code or test bug* (a real assertion failure, a type, lint or build error caused by the branch): fix it like any other finding.
    - *outdated branch* (it fails because `main` moved on, e.g. a CI fix that landed after the branch was cut): merge the default branch into the feature branch, then continue.
  - **Merge conflicts** (an `ADLC: this PR has merge conflicts` comment, or `gh pr view --json mergeable` says `CONFLICTING`): merge the default branch into the feature branch and resolve every conflict keeping the intent of both sides. The default branch's changes were reviewed and merged, so never drop them to make the branch's version win. Then run build-runner, review and push as for any rework. If a conflict needs a product or design decision (both sides changed the same behaviour differently), don't guess: ask on the issue and set `adlc:needs-info`.
    - *environment* (runner, emulator, device dialogs, network or proxy, disk, registry, a service that didn't start; or the same check passes on another runner): **never change the app or weaken the tests to make it pass.** If it's in the project's own test setup (compose files, test scripts, workflows), open a separate issue with the evidence (`gh issue create`, label `adlc:queued`, link the PR) and keep this PR as it is. If it's outside the project (the ADLC runner, the dev server), say so in the reply.
    - *flaky* (it can't be reproduced locally and looks timing-dependent): don't change the code for it. Say so in the reply, with the evidence.

    If only environment or flaky failures remain, skip the fix loop, reply on the PR, set `adlc:blocked` with the reason (as in Abort, without `-aborted` in `state.json`), and stop.
  2. Set `state.json` to `phase: "rework-<k>"`, then go through debugger (with `rework-<k>.md` as the findings) → build-runner (→ qa-engineer if UI changed) → Review (§7) → push to the **same** branch, so the PR updates. Do only what was asked plus what the checks need. A request that conflicts with the spec, the architecture or a policy is not applied: explain why in the reply.
  3. Reply on the PR with one line per request: done (with commit) or not done and why. Keep the PR open. Auto-merge policy and `adlc:needs-human-review` stay as they were. Set the label `adlc:pr-open`, remove `adlc:in-progress`. Final output `pr-open`.
- Determine the default branch. Create `adlc/<n>-<slug>` from an up-to-date `origin/<default>`. If the branch already exists locally or on origin (and it is not a rework, see above), resume: fetch it, read `state.json` and continue from the recorded phase. **A recorded `<phase>-aborted` means a person relabelled the blocked issue `adlc:ready`: that is a retry, not a reason to stop.** Read the issue comments after the abort comment (the owner's notes, e.g. what was fixed in the environment), add 1 to `retries` in `state.json`, and restart that phase at attempt 1 with fresh attempt counters. If it aborts again for the same reason, the abort comment says so explicitly.
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
Run `env.down`. Commit and push what exists. Record `<phase>-aborted` in `state.json`. Comment on the issue with phase, reason, what a person needs to do, and the last report paths (≤ 10 lines). **Never set `adlc:blocked` without that comment.** Set label `adlc:blocked`, remove `adlc:in-progress`. Stop.

## Final output
One line: `ADLC #<n>: <merged-queued|pr-open|needs-info|blocked> — <PR or issue URL>`.
