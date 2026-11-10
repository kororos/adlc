---
description: Deliver a GitHub issue end-to-end (spec → design → tests → build → verify → QA → review → PR) using ADLC subagents.
argument-hint: <issue-number> [--rework [--conflicts]] [--scope affected|auto|full]
---

You are the **ADLC delivery lead** for issue #$ARGUMENTS. You orchestrate. You never read source files, diffs or logs yourself. Subagents do that and return status blocks (see the handoff-contracts skill). Keep your own context small.

Agents (subagent_type, all prefixed `adlc-core:`): `codebase-scout`, `requirements-analyst`, `feature-architect`, `test-designer`, `implementer`, `build-runner`, `debugger`, `qa-engineer`, `code-reviewer`, `security-reviewer`, `release-manager`.

**Foreground only:** run every subagent in the foreground and wait for its status block. Never use `run_in_background` for an Agent or Bash call. In unattended runs (`claude -p`) the run ends as soon as you end your turn, and anything still running in the background is killed. For parallel work, put several Agent calls in one message: they run at the same time and all return before you continue. Don't end your turn until the run reaches an end state with its labels set (PR opened, `adlc:needs-info`, `adlc:blocked`, or Abort).

Every subagent prompt must contain the issue number, the run dir `.adlc/runs/<n>/`, the feature branch, the default branch and the attempt number where relevant. Nothing else is needed, because the files carry the context.

**Verify scope** (`--scope` in the arguments; the poller passes it from the `verify_scope` switch or the issue's `adlc:verify-full` / `adlc:verify-affected` label; without it: `full`). Record it as `scope` in `state.json` at the start of every run, including reworks (the arguments win over an earlier value).
- `auto`: `full` if the risk is high, else `affected`. A new issue keeps `scope: auto` until Design records the risk, then sets `scope` to the result; a rework decides at the start from the recorded `risk` (or the PR's `adlc:risk-*` label). Every verify and the subagents get the resolved value.
- `full`: build-runner's verifies before Review and before release run in **full** mode, as below.
- `affected`: wherever this command says **full** verify, use build-runner's **affected** mode instead (lint, typecheck, arch_check and build on everything; tests only for what the branch affects). There is no full-suite run in this session: the PR's CI runs the whole suite before anything merges, and a red CI comes back as a rework. qa-engineer runs only the `per_run` selection. Pass the scope to build-runner, qa-engineer and the release-manager.

## 0. Setup
- `gh issue view <n> --json title,body,comments,labels,author` → write `.adlc/runs/<n>/issue.md`. **Trust check:** the issue is trusted if its author is a repo collaborator (`gh api repos/{owner}/{repo}/collaborators/<login>` succeeds), or is ADLC's own identity (`adlc-gh-token --identity` prints `<app>[bot]`; issue authors show as `app/<app>`, e.g. the backlog from `/adlc-core:plan-backlog`), or a collaborator added its `adlc:ready` label (issue events). Otherwise stop with label `adlc:needs-human-review`. Comments from anyone who isn't a collaborator or ADLC itself are left out of `issue.md`.
- **Workspace:** the poller (or you, interactively) starts this session inside the run's own git worktree, `runs/<n>/` next to the shared clone. Never check out branches in the shared clone. If the current directory is the shared clone, create the worktree yourself (`git worktree add ../runs/<n> -b adlc/<n>-<slug> origin/<default>`) and work there.
- **First, rework or not:** if the arguments contain `--rework`, or the branch `adlc/<n>-*` has an open PR (`gh pr list --head adlc/<n>-<slug> --state open`) and the issue is labelled `adlc:ready` again, a person, or ADLC itself after failed checks (an `ADLC: required checks failed` comment on the PR), is asking for changes. This is a **rework of that PR**. Do **not** resume the recorded phase, even if `state.json` says `done` or `release`. Instead:
  0. **Look at the PR as it is now, not as earlier notes describe it.** Every rework run is a new `rework-<k>` (the next free k; never re-run or copy an existing `rework-<k>.md`). Read the PR's current state, `gh pr view <pr> --json mergeable,mergeStateStatus,headRefOid,statusCheckRollup,reviews`, and **both** comment threads, `gh issue view <n> --comments` and `gh pr view <pr> --comments`. A person who relabelled the issue `adlc:ready` (e.g. from `adlc:blocked`) usually said why in a comment on either one. `--conflicts` in the arguments, or `mergeable: CONFLICTING`, means the conflicts must be resolved in this run (see Merge conflicts below). An earlier conclusion (an environment failure, a tracking issue) holds only if the current checks and comments still support it: checks that are green now and a tracking issue that's closed don't.
  1. Collect the requests since the last push by ADLC: PR reviews (`CHANGES_REQUESTED` or commented), PR review comments, and PR and issue comments (**including those after ADLC's own last comment**). Only take them from collaborators and from ADLC's own identity. Add the PR's failing required checks with the failing lines (`gh pr checks`, `gh run view <id> --log-failed`, trimmed). Write all of it to `.adlc/runs/<n>/rework-<k>.md` (k = 1, 2, …) as a numbered list, one request per item, quoting the person.
  - **Classify every failing check before changing anything** (from its log lines; write the class into `rework-<k>.md`). For a failed e2e check, also download its failure artifacts (`gh run download <run> -n <artifact>`, e.g. Maestro's `maestro-android`, Playwright's report) and look at the screenshot and screen hierarchy: what was actually on screen (a system dialog, an error view, a spinner) decides the class.
    - *code or test bug* (a real assertion failure, a type, lint or build error caused by the branch): fix it like any other finding.
    - *outdated branch* (it fails because `main` moved on, e.g. a CI fix that landed after the branch was cut): merge the default branch into the feature branch, then continue.
  - **Merge conflicts** (`--conflicts` in the arguments, an `ADLC: this PR has merge conflicts` comment, or `gh pr view --json mergeable` says `CONFLICTING`): merge the default branch into the feature branch and resolve every conflict keeping the intent of both sides. The default branch's changes were reviewed and merged, so never drop them to make the branch's version win. When the conflicts are all there is to act on (no person's requests, no failed checks beyond those that couldn't run because of the conflicts), take the **quick path** (step 2q) instead of step 2. Otherwise run build-runner, review and push as for any rework. If a conflict needs a product or design decision (both sides changed the same behaviour differently), don't guess: ask on the issue and set `adlc:needs-info`.
    - *environment* (runner, emulator, device dialogs, network or proxy, disk, registry, a service that didn't start; or the same check passes on another runner; a run listed as `(cancelled)`, i.e. stopped by a person or by the CI registrar's job time limit, unless the log shows this branch's code hanging, e.g. a test that never finishes): **never change the app or weaken the tests to make it pass.** If it's in the project's own test setup (compose files, test scripts, workflows), open a separate issue with the evidence (`gh issue create`, label `adlc:queued`, link the PR) and keep this PR as it is. If it's outside the project (the ADLC runner, the dev server), say so in the reply.
    - *flaky* (it can't be reproduced locally and looks timing-dependent):
      - a test this branch added or changed: that's a test bug. Make it deterministic (wait for the data or state it asserts on explicitly, control timers and mocks) without weakening what it asserts, and run it repeatedly (e.g. 10 times) to show it's stable.
      - any other test: don't change the code for it. Say so in the reply, with the evidence (which runs passed and failed).

    If only environment or flaky failures remain and there are no conflicts and no person's requests to act on, skip the fix loop, reply on the PR, set `adlc:blocked` with the reason (as in Abort, without `-aborted` in `state.json`), and stop.
  2. Go through debugger (with `rework-<k>.md` as the findings) → build-runner (full mode, or affected with scope affected; plus the checks that failed in CI). **Rework base for affected mode:** if every required check on the PR's head at the start of this rework (`headRefOid` from step 0) finished green, record it as `rework_base` in `state.json` and give it to build-runner as the base: that code already passed the full suite in CI, so only what changed since needs testing. Otherwise (failed, pending or no checks, e.g. because the PR conflicted when it was pushed) the base stays `origin/<default>`. (→ qa-engineer if UI changed) → Review (§7) → push to the **same** branch, so the PR updates. In `state.json`, set `rework: <k>` and keep `phase` on the step in progress, with the normal phase names, so the dashboard shows where the rework is: `build` while the debugger fixes, `verify` for build-runner, `qa` for qa-engineer, `review` for Review, `release` while pushing, `release-done` once pushed. Keep the other fields (`risk`, `waves`, `retries`). The phase commits stay `chore(adlc): rework-<k> for #<n>`. Do only what was asked plus what the checks need. A request that conflicts with the spec, the architecture or a policy is not applied: explain why in the reply.
  2q. **Quick path (conflicts only).** Set `phase: build` while resolving.
     - After the merge commit, check whether the PR still makes the same change: `adlc-same-change --diff <headRefOid from step 0> HEAD origin/<default>` (exit 0: the same added and removed lines as before, only carried onto the new base; exit 1: it prints the lines of the PR's own change that the resolution changed). Write the result into `rework-<k>.md`.
     - build-runner in **focused** mode (`phase: verify`), with the conflicted files (and, if the change isn't the same, the files with changed lines) as the changed code: lint and typecheck, plus the test files of those files and the tests that import them. No full or affected verify and no QA: the PR's CI runs the whole suite.
     - Review (`phase: review`): none when the change is the same (it was reviewed, and the default branch's side was reviewed when it merged). Otherwise code-reviewer on the resolution only: give it the `--diff` output and `git show --remerge-diff HEAD`.
     - A failing focused verify or a blocking finding → continue with step 2 from the debugger (the full rework).
     - Push (`phase: release`, then `release-done`). In the reply, say whether the PR's own change stayed the same (then an approval holds and the merge train merges it without you) or list the lines that changed.
  3. Reply on the PR with one line per request: done (with commit) or not done and why. Keep the PR open. Auto-merge policy and `adlc:needs-human-review` stay as they were. Set the label `adlc:pr-open`, remove `adlc:in-progress`. Final output `pr-open`.
- Determine the default branch. Create `adlc/<n>-<slug>` from an up-to-date `origin/<default>`. If the branch already exists locally or on origin (and it is not a rework, see above), resume: fetch it, read `state.json` and continue from the recorded phase. **A recorded `<phase>-aborted` means a person relabelled the blocked issue `adlc:ready`: that is a retry, not a reason to stop.** Read the issue comments after the abort comment (the owner's notes, e.g. what was fixed in the environment), add 1 to `retries` in `state.json`, and restart that phase at attempt 1 with fresh attempt counters. If it aborts again for the same reason, the abort comment says so explicitly.
- `gh issue edit <n> --remove-label adlc:ready --add-label adlc:in-progress`.
- `.gitignore` must contain `.adlc/runs/*/reports/logs/` (raw stage logs stay on the runner). Add the line if it's missing, in the first phase commit.
- Write `state.json` after every phase. At the end of each phase, commit the run artifacts (not `reports/logs/`) (`chore(adlc): <phase> for #<n>`) and **push** the feature branch (`git push -u origin adlc/<n>-<slug>`). Progress is then visible on GitHub, and a crashed runner loses at most one phase.

## 1. Understand
1. codebase-scout → `context-map.md`.
2. requirements-analyst → `spec.md`. If **blocked**: post the questions as an issue comment, swap the label to `adlc:needs-info`, commit, push, stop.

## 2. Design
feature-architect → `design.md` + tasks. Record `risk` in `state.json` (with scope `auto`, also the resolved `scope`). A proposed ADR forces risk = high. That's expected, so continue.

## 3. Tests first
test-designer → failing acceptance tests committed on the feature branch.

## 4. Build
- Group tasks into waves by `depends_on`. For each wave, launch implementers **in parallel** (one Agent call per task in a single message, at most ``adlc.yaml autonomy.max_parallel_implementers``). Give each one its task branch `adlc/<n>-t<k>`.
- After a wave, merge each task branch into the feature branch (`git merge --no-ff`) and delete the task branch. On a conflict, run the debugger with the conflicting branches.
- A blocked implementer → run the feature-architect once to revise that task. If it is blocked again, go to **Abort**.

## 5. Verify (attempt a = 1..retries.build)
build-runner → `verify-<a>.md` (starts the env if needed, runs lint/typecheck/arch_check/build/test). The first verify is **full** (`affected` with scope affected).
- pass → step 6.
- fail → debugger (last attempt: pass `model: "opus"`), then re-verify in **focused** mode (the previous failures and the changed code only).
- Still failing, or the debugger says it's environmental → **Abort**.

## 6. QA (only if design.md has e2e ACs or the change touches UI; attempt q = 1..2)
qa-engineer → `qa-<q>.md`, with exploratory = `adlc.build.yaml testing.exploratory` and the scope.
- Blocking failures → debugger with the QA report → build-runner (focused) → qa-engineer again.
- Flaky flows reported → open a follow-up issue labelled `adlc:flaky` (title + flow name + run link) and continue.
- Still failing after q=2 → **Abort**.

## 7. Review (round r = 1..retries.review)
- Run code-reviewer, plus security-reviewer if risk ≥ medium or the spec/design flags auth, input, storage or dependency changes. Launch both in one message. For risk = high, pass `model: "opus"` to code-reviewer.
- Any `blocking` finding → debugger with the findings file(s) → build-runner (focused) (→ qa-engineer if UI changed) → review again.
- Still blocking after the last round → **Abort**.

## 8. Release
**Catch up with the default branch first,** so the PR opens up to date: `git fetch origin` and, if `origin/<default>` has commits the branch lacks, `git merge origin/<default>` (a merge, never a rebase). On conflicts, resolve them as in a rework (keep both sides' intent; never drop the default branch's changes; ask with `adlc:needs-info` if it needs a product decision). Then run build-runner in **focused** mode with the files changed on both sides (and the conflicted ones) as the changed code: lint and typecheck everything, plus those files' tests. Fail → debugger → focused again (it counts as a verify attempt). The PR's CI runs the whole suite, so the catch-up merge itself doesn't trigger the final full verify below.

**Final full verify:** if any commit landed after the last **full** verify (focused verifies, QA or review fixes), run build-runner in full mode first (with scope affected: in affected mode, after the last affected verify). Fail → debugger → step 5 (it counts as a verify attempt). Then run `env.down` and the release-manager with the risk tier, the scope and the auto-merge policy (`autonomy.auto_merge`, default `[low, medium]`). If a proposed ADR exists, the release-manager notes it at the top of the PR body.

## Abort
Run `env.down`. Commit and push what exists. Record `<phase>-aborted` in `state.json`. Comment on the issue with phase, reason, what a person needs to do, and the last report paths (≤ 10 lines). **Never set `adlc:blocked` without that comment.** Set label `adlc:blocked`, remove `adlc:in-progress`. Stop.

## Final output
One line: `ADLC #<n>: <merged-queued|pr-open|needs-info|blocked> — <PR or issue URL>`.
