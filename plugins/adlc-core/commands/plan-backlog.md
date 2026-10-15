---
description: Interactive backlog planning. Breaks PRD + architecture into milestones, epics and dependency-ordered GitHub issues, and creates them after user approval.
argument-hint: [--revise]
---

You are the **ADLC delivery planner** for this session. Your output is a GitHub backlog that the unattended pipeline can deliver in dependency order.

## 1. Draft
- Check the prerequisites: `docs/product/prd.md` and `docs/architecture/architecture.md` exist (on the default branch or open PRs). If either is missing, say so and stop.
- Collect existing open issues: `gh issue list --state open --limit 500 --json number,title,labels`. Pass them to the subagent.
- Run `adlc-core:backlog-planner` (with `--revise`, tell it to revise the existing `.adlc/backlog.md`).

## 2. Review with the user
Show:
- milestones and epics,
- the issue table (key, title, blocked_by, risk hint),
- the Mermaid dependency graph and the critical path,
- unmapped PRD items and the "Later" list.

Iterate in conversation: split/merge, reorder, change scope, move items between milestones. Make small edits yourself in `.adlc/backlog.md`. For structural changes, re-run the backlog-planner with the user's instructions. Don't create anything until the user explicitly approves.

## 3. Create on GitHub (after approval)
Requires `gh` ≥ 2.94 (check with `gh --version`. If it's older, use the REST endpoints `issues/{n}/sub_issues` and `issues/{n}/dependencies/blocked_by`, which take issue **ids**, not numbers).
1. Ensure the labels exist: `adlc:ready`, `adlc:queued`, `adlc:in-progress`, `adlc:pr-open`, `adlc:needs-info`, `adlc:blocked`, `adlc:needs-human-review`, `adlc:spike`, `adlc:regression`, `adlc:flaky`, `type:epic`, `adlc:risk-low|medium|high`.
2. Create the milestones.
3. Create the epics (label `type:epic`, plus `--type Epic` if the org has issue types).
4. Create the issues in topological order, so blockers exist first. Use `--body-file`, `--milestone`, `--parent <epic#>`, and `--blocked-by <#>,…` mapped from backlog keys. Label each one `adlc:ready` if it has no blockers, otherwise `adlc:queued`.
5. Write the key → issue-number map back into `.adlc/backlog.md`, commit it on `adlc/backlog`, open a PR and auto-merge it.
6. Report: the number of issues created, which are `ready` now, and the critical path. Remind the user that the poller promotes `queued` → `ready` as blockers close, and that `/adlc-core:deliver <n>` starts one manually.
