---
name: handoff-contracts
description: ADLC file layout, artifact formats (product docs, architecture docs, ADRs, backlog, run artifacts), risk tiers and the status block every ADLC subagent returns. Load whenever working on ADLC artifacts (docs/product, docs/architecture, .adlc/).
user-invocable: false
---

# ADLC handoff contracts

## Project-level documents (long-lived, on the default branch)
| Path | Owner | Purpose |
|---|---|---|
| `docs/product/vision.md` | product-lead (/discover) | Problem, users, goals, non-goals |
| `docs/product/prd.md` | product-lead | Features `F<k>` with user stories and acceptance criteria |
| `docs/product/glossary.md` | product-lead | Domain terms |
| `docs/product/suggestions.md` | product-lead (+ product-advisor) | Every enhancement suggestion and its outcome |
| `docs/architecture/architecture.md` | solution-architect (/architect) | C4 context/container, modules, data, APIs, deployment |
| `docs/architecture/quality-attributes.md` | solution-architect | Measurable targets tagged now / later / speculative |
| `docs/architecture/evolution.md` | solution-architect | Seams and triggers for future needs |
| `docs/architecture/adr/NNNN-<slug>.md` | solution-architect, feature-architect | Decisions |
| `docs/architecture/fitness.md` | solution-architect | Automated architecture checks and how they run |
| `.adlc/backlog.md` | backlog-planner (/plan-backlog) | Epics/issues before they are created on GitHub |

### suggestions.md format
```
| id | round | lens | suggestion | impact/effort | source | status | outcome |
| S3.1 | 3 | parity | Waitlist for full classes | H/M | mindbody.io/… | accepted | F7, AC F7.1-3 |
| S3.2 | 3 | edge | Double-booking race | H/L | reasoning | accepted | AC F2.4 |
| S4.1 | 4 | differentiator | Smart class recommendations | M/H | reasoning | deferred | prd.md Later |
| S5.2 | 5 | nfr | Offline booking queue | M/H | reasoning | rejected | "gyms have wifi" — @owner |
```
Status: proposed | accepted | deferred | rejected | skipped. Rejected and skipped items are never re-suggested without new information.

### ADR format
```
# NNNN — <decision title>
Status: proposed | accepted | superseded by NNNN
Date: YYYY-MM-DD
## Context        forces, constraints, quality attributes involved
## Decision       one paragraph, active voice
## Alternatives   option — why not (one line each)
## Consequences   positive / negative / follow-ups
```
Only `accepted` ADRs bind. A `proposed` ADR forces risk = high.

## Delivery run directory
Everything for issue `<n>` lives in `.adlc/runs/<n>/` on the feature branch `adlc/<n>-<slug>`:

| File | Owner | Purpose |
|---|---|---|
| `issue.md` | lead | Snapshot of the issue title, body and comments |
| `state.json` | lead | `{phase, risk, attempts:{build,qa,review}, branch, tasks:{T1:"done"}}` |
| `context-map.md` | codebase-scout | Relevant files, conventions, commands |
| `spec.md` | requirements-analyst | Problem, scope, acceptance criteria |
| `design.md` | feature-architect | Approach, risk tier, task list |
| `tasks/T<k>.md` | feature-architect | One implementable unit each |
| `reports/verify-<a>.md` | build-runner | Condensed build/test/arch-check result for attempt `a` |
| `reports/qa-<a>.md` | qa-engineer | E2E result and exploratory findings |
| `reports/review.md` | code-reviewer | Findings |
| `reports/security.md` | security-reviewer | Findings |

Project commands, environment steps and testing targets come from `adlc.build.yaml` at the repo root; policy (autonomy, risk/merge rules, setup facts) from `adlc.yaml`. Never guess them.

## Status block (final message of every subagent)
Return ONLY this, at most 15 lines. Details go in files, not in the reply.

```
STATUS: done | blocked | failed
ARTIFACTS: <comma-separated paths written or changed>
SUMMARY: <1-3 lines>
ISSUES: <none | short list, each with file:line>
NEXT: <recommended next step for the lead>
```

## spec.md
```
# <title>
Source: #<n>, prd.md F<k> (if any)
## Problem            (2-5 lines, user-facing)
## Scope              in / out bullets
## Acceptance criteria
- AC1: Given … When … Then …     (testable, numbered, no implementation detail)
## Non-functional     perf, security, a11y, platforms (web/android/ios) if relevant
## Assumptions
## Open questions     empty if none; non-empty → STATUS: blocked
```

## design.md
```
# Design — <title>
## Approach            ≤ 15 lines; reference existing modules by path and ADRs by number
## Data / API changes  schemas, endpoints, migrations (or "none")
## Architecture        "conforms" | "deviates — see ADR NNNN (proposed)"
## Risk: low | medium | high — <one-line reason>
## Tasks
| id | title | depends_on | files (expected) | ACs | e2e ACs |
```

### Risk tiers
- **high**: auth/authz, payments, secrets/crypto, DB migrations that drop or rewrite data, infra/CI changes, new runtime dependency, public API breaking change, any proposed ADR. Needs a human merge.
- **medium**: new endpoint, schema addition, cross-module refactor, native-module (iOS/Android) changes. Auto-merge after an Opus review.
- **low**: everything else. Auto-merge after a Sonnet review.

## tasks/T<k>.md
```
# T<k> — <title>
Depends on: <ids|none>
ACs: AC1, AC3
Files: <expected paths>
Instructions: <≤ 20 lines, concrete>
Done when: <tests / commands that must pass>
```

## Backlog issue body (created by /plan-backlog)
```
<user-facing summary, 2-4 lines>

**Feature:** prd.md F<k> · **Epic:** #<epic>
**Acceptance criteria**
- AC1: Given … When … Then …
**Notes for the architect:** relevant ADRs, modules, risk hint
```

## Findings format (review.md, security.md, qa-*.md)
```
VERDICT: approve | changes-requested
- [blocking|minor] path:line — problem — suggested fix
```
Only `blocking` findings trigger another round. Don't report style issues a linter would catch.

## Git conventions
- Feature branch `adlc/<n>-<slug>`. Task branches `adlc/<n>-t<k>`. Project-level doc work: `adlc/discovery`, `adlc/architecture`.
- Conventional commits referencing the issue: `feat(api): add refresh endpoint (#<n>)`.
- Never push to the default branch and never force-push.
