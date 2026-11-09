// Synthetic dashboard data for the tutorial video: a fictional project "orbit" (acme/orbit), a class-booking
// app for small gyms. Nothing here comes from a real project.
const NOW = Date.now()
const ago = (min) => new Date(NOW - min * 60_000).toISOString()
const stamp = (min) => ago(min).replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
const REPO = "acme/orbit"
const gh = (kind, n) => `https://github.com/${REPO}/${kind}/${n}`

const q = (rank, number, title, state, milestone, extra = {}) => ({
  rank, number, title, url: gh("issues", number), state, milestone, blockers: [], unblocks: 0, assignees: [], epic: 30, ...extra,
})

export const queue = [
  q(1, 18, "Members book a class from the mobile app", "in-progress", "M2 Booking"),
  q(2, 17, "Owner dashboard: today's classes and attendance", "pr-open", "M2 Booking", { rework: true }),
  q(3, 16, "Members pay for class packs with Stripe", "pr-open", "M2 Booking", { epic: 31 }),
  q(4, 25, "[owner] Create the dev secret stripe_api_key", "owner", "M2 Booking", { unblocks: 2, epic: 31 }),
  q(5, 19, "Owners create recurring classes", "ready", "M2 Booking"),
  q(6, 23, "Reminder before a class: e-mail or push?", "needs-info", "M2 Booking"),
  q(7, 21, "Waitlist when a class is full", "queued", "M2 Booking", { blockers: [{ number: 18, owner: false }] }),
  q(8, 22, "Cancel a booking up to 2 hours before", "queued", "M2 Booking", { blockers: [{ number: 18, owner: false }] }),
  q(9, 26, "Refund a class pack", "queued", "M3 Payments", { blockers: [{ number: 16, owner: false }, { number: 25, owner: true }], epic: 31 }),
  q(10, 27, "Monthly revenue report for owners", "queued", "M3 Payments", { blockers: [{ number: 26, owner: false }], epic: 31 }),
  q(11, 28, "Members see their booking history", "queued", "M3 Payments", { blockers: [{ number: 22, owner: false }] }),
]

const pr = (number, title, closes, extra = {}) => ({
  number, title, url: gh("pull", number), draft: false, createdAt: ago(300), author: "app/adlc-acme",
  reviewDecision: null, mergeState: "BLOCKED", labels: [], closes: [closes], checks: "SUCCESS", ...extra,
})
export const pullRequests = [
  pr(42, "feat(web): owner dashboard with today's classes and attendance (#17)", 17, { checks: "PENDING", labels: ["adlc:risk-low"] }),
  pr(40, "feat(api): members pay for class packs with Stripe (#16)", 16, { reviewDecision: "REVIEW_REQUIRED", labels: ["adlc:risk-high", "adlc:needs-human-review"] }),
]

const job = (name, status, extra = {}) => ({
  name, status, conclusion: status === "completed" ? "success" : null, url: `https://github.com/${REPO}/actions/runs/9001/job/1`,
  queuedAt: ago(9), startedAt: status === "queued" ? null : ago(8), completedAt: status === "completed" ? ago(5) : null,
  runner: status === "queued" ? null : "adlc-orbit-test-1762", role: "test", host: null, labels: ["self-hosted", "adlc-test"], ...extra,
})
const run = (id, workflow, title, branch, pr, jobs, extra = {}) => ({
  id, workflow, title, branch, event: pr ? "pull_request" : "push", sha: "4c9e21a", pr, url: `https://github.com/${REPO}/actions/runs/${id}`,
  status: "in_progress", conclusion: null, createdAt: ago(9), startedAt: ago(8), updatedAt: ago(1), jobs, ...extra,
})
export const actions = {
  generatedAt: ago(0.5),
  runs: [
    run(9001, "ci", "feat(web): owner dashboard (#17)", "adlc/17-owner-dashboard", 42, [
      job("lint", "completed"), job("typecheck", "completed"), job("test", "in_progress"), job("e2e-web", "queued"),
    ]),
    run(9002, "publish", "feat(api): class schedule API (#15) (#39)", "main", null, [
      job("publish", "in_progress", { runner: "adlc-orbit-publish-1762", role: "publish", labels: ["self-hosted", "adlc-publish"] }),
    ], { sha: "7b31d0e" }),
    run(8990, "ci", "feat(api): class schedule API (#15) (#39)", "main", null, [job("test", "completed"), job("lint", "completed")],
      { status: "completed", conclusion: "success", sha: "7b31d0e", createdAt: ago(40), updatedAt: ago(25) }),
  ],
}

export const epics = [
  { number: 30, title: "Booking", url: gh("issues", 30), milestone: "M2 Booking", priority: false, total: 9, completed: 4, ready: 1, parent: null, subs: null },
  { number: 31, title: "Payments", url: gh("issues", 31), milestone: "M3 Payments", priority: false, total: 5, completed: 0, ready: 0, parent: null, subs: null },
]

const comment = (body, min) => ({ author: "app/adlc-acme", at: ago(min), url: gh("issues", 23), body })
export const attention = [
  { ...q(6, 23, "Reminder before a class: e-mail or push?", "needs-info", "M2 Booking"),
    lastComment: comment("ADLC needs a decision: should class reminders go out by e-mail, push notification, or both? The PRD doesn't say, and push needs the Expo notification setup (an owner task).", 50) },
  { ...q(4, 25, "[owner] Create the dev secret stripe_api_key", "owner", "M2 Booking", { unblocks: 2 }),
    lastComment: { author: "app/adlc-acme", at: ago(70), url: gh("issues", 25), body: "Create the Stripe test key as the dev secret stripe_api_key: see the PR #40 owner notes for the command." } },
]

export const triage = [
  { number: 29, title: "Flaky: booking.spec.ts 'shows the waitlist' times out on slow runners", url: gh("issues", 29), kind: "flaky", created: ago(180), milestone: "", blockers: [],
    lastComment: null },
]

export const snapshot = {
  generatedAt: ago(0.7), repo: REPO,
  counts: { "in-progress": 1, "pr-open": 2, owner: 1, ready: 1, "needs-info": 1, queued: 5 },
  queue, wip: { openPrs: 2, max: 4, held: false }, triage, epics, cyclic: [], attention, pullRequests, actions,
}

const runFile = `18-${stamp(38)}.jsonl`
export const activeRun = { file: runFile, issue: 18, started: ago(38), updated: ago(0.1), result: null }

export const mergeTrain = {
  mode: "on", updated: ago(0.5),
  prs: [
    { pr: 42, issue: 17, title: "feat(web): owner dashboard with today's classes and attendance (#17)", status: "checks", detail: "risk low (no approval needed): joins once its checks are green" },
  ],
}

const setting = (key, value, allowed, source = "default") => ({ key, value, source, project: value, allowed })
export const project = {
  slug: "orbit", repo: REPO, paused: false, backoffUntil: null, pending: [],
  active: [{ issue: 18, title: "Members book a class from the mobile app", run: activeRun, progress: { phase: "build", rework: null, risk: "medium", scope: "affected", tasks: 4 } }],
  baseDomain: "lan", loggedIn: true, devDeployed: "sha-4c9e21a",
  dockerUsage: { text: "images 14 (9.8 GB, 3.1 GB reclaimable) · build cache 4.2 GB · volumes 6 (2.3 GB)", updated: ago(40) },
  mergeTrain, devMissingSecrets: null,
  settings: [
    setting("merge_train", "on", ["on", "dry-run", "off"]),
    setting("ci_auto_rework", "on", ["on", "off"]),
    setting("keep_prs_current", "on", ["on", "off"]),
    setting("rework_first", "on", ["on", "off"]),
    setting("max_open_prs", "4", ["off", "2", "3", "4", "5", "6", "8"], "adlc.yaml"),
    setting("update_before_merge", "overlap", ["always", "overlap"], "dashboard"),
    setting("verify_scope", "affected", ["affected", "auto", "full"]),
  ],
  nightly: { workflow: "nightly.yml", trigger: "repository_dispatch", requested: null,
    last: { databaseId: 8800, status: "completed", conclusion: "success", event: "schedule", createdAt: ago(560), updatedAt: ago(530), url: `https://github.com/${REPO}/actions/runs/8800` } },
  health: {
    poller: { updated: ago(0.3), last: `${ago(0.3)} [poller] #18: run in progress (build)` },
    deployer: { updated: ago(0.5), last: `${ago(0.5)} [deployer] waiting for CI to publish sha-7b31d0e: api web` },
    rc: { updated: ago(2), last: `${ago(2)} [rc] Ready · orbit` },
  },
  snapshot,
}

export const summary = {
  slug: "orbit", repo: REPO, paused: false, backoffUntil: null, pending: [], active: project.active,
  counts: snapshot.counts, snapshotAt: snapshot.generatedAt, attention: 2, reviews: 1, ciRunning: 2,
}

const done = (issue, minAgo, mins, cost, turns) => ({
  file: `${issue}-${stamp(minAgo)}.jsonl`, issue, started: ago(minAgo), updated: ago(minAgo - mins),
  result: { outcome: "success", error: false, costUsd: cost, durationMs: mins * 60_000, turns, text: `PR opened for #${issue}` },
})
export const runs = [
  activeRun,
  done(17, 300, 52, 6.4, 118), done(16, 420, 95, 11.2, 201), done(15, 640, 47, 5.1, 96),
  done(14, 900, 63, 7.8, 133), done(13, 1300, 41, 4.6, 88), done(12, 1700, 58, 6.9, 121),
  done(1, 4300, 140, 18.5, 302),
]
export const totals = { runs: 8, finished: 7, costUsd: 60.5, durationMs: 496 * 60_000, last30: { runs: 8, costUsd: 60.5 } }

export const hosts = [
  { name: "dev-server", role: "main", at: ago(0.2), stale: false, cpuPct: 46, load1: 2.1, cores: 8, mem: { totalGb: 32, usedPct: 58 }, disk: { freeGb: 212, totalGb: 400 } },
  { name: "ci2", role: "ci", at: ago(0.4), stale: false, cpuPct: 31, load1: 1.4, cores: 8, mem: { totalGb: 24, usedPct: 41 }, disk: { freeGb: 96, totalGb: 150 } },
]
export const disk = { freeGb: 212, totalGb: 400, minFreeGb: 15, warnPct: 75 }

// The live log of #18's run (Now tab): what the lead and its subagents did so far.
const t = (text) => ({ kind: "text", text, sub: false })
const tool = (toolName, summary, sub = false) => ({ kind: "tool", tool: toolName, summary, sub })
export const runEvents = [
  { kind: "start", model: "claude-sonnet-5-5", sub: false },
  t("Branch adlc/18-members-book-a-class is current. Writing state and starting Understand."),
  tool("Agent", "codebase-scout: map booking, schedule and auth code for #18"),
  tool("Agent", "requirements-analyst: spec with testable ACs for #18"),
  t("Spec ready: 6 acceptance criteria (see the week's classes, book a spot, full classes, double booking, cancellation window, audit entry). No open questions."),
  tool("Agent", "feature-architect: design and tasks for #18"),
  t("Design: risk medium, 4 tasks in 2 waves. API contract for /bookings agreed; migration adds bookings with a unique (class, member) constraint."),
  tool("Agent", "test-designer: failing acceptance tests for #18"),
  t("Tests first: 14 tests across API integration, web components and the mobile booking flow, all failing for the right reason. Starting the build: wave 1 (T1)."),
  tool("Agent", "implementer: T1 bookings schema, migration and repository"),
  tool("Bash", "Merge task branch T1 into the feature branch"),
  t("Wave 1 merged. Wave 2 runs T2, T3 and T4 in parallel."),
  tool("Agent", "implementer: T2 booking endpoints and capacity check"),
  tool("Agent", "implementer: T3 mobile class list and booking sheet"),
  tool("Agent", "implementer: T4 owner view of bookings per class"),
]

export const logLines = {
  poller: [
    `${ago(45)} [poller] merge train: merged PR #39 (#15): green and up to date`,
    `${ago(40)} [poller] #15 closed: removed worktree and local branches`,
    `${ago(38)} [poller] #18: starting delivery, affected verify, in /srv/adlc/projects/orbit/runs/18`,
    `${ago(12)} [poller] #17: PR #42 was 2 commit(s) behind main with green checks; merged main into it`,
  ],
  deployer: [`${ago(46)} [deployer] dev is now at sha-4c9e21a`, `${ago(0.5)} [deployer] waiting for CI to publish sha-7b31d0e: api web`],
  rc: [`${ago(2)} [rc] Ready · orbit`],
}
