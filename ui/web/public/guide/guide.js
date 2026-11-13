// ADLC Field Guide: overview, issue-lifecycle simulator, tutorials, troubleshooting and references (index.html).
"use strict"
const $ = (s) => document.querySelector(s)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}
function codeBlock(text) {
  return `<div class="code"><button class="copy" type="button">Copy</button><pre>${esc(text)}</pre></div>`
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".copy"); if (!b) return
  const text = b.nextElementSibling.textContent
  const done = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400) }
  const fallback = () => { const r = document.createRange(); r.selectNodeContents(b.nextElementSibling); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected" }
  try { navigator.clipboard.writeText(text).then(done, fallback) } catch { fallback() }
})

/* ── Overview flow ─────────────────────────────────────────────── */
const FLOW = [
  { n: "once", t: "init", s: "repo, CI, environments", cmd: "/adlc-core:init",
    you: ["Answer section by section, or accept defaults and review the summary", "Run .adlc/provision.sh yourself with your GitHub admin login"],
    out: ["adlc.yaml (setup values)", "docs/project/setup.md with open tbd items", "A PR you merge"] },
  { n: "step 1", t: "discover", s: "idea → PRD", cmd: "/adlc-core:discover <idea>",
    you: ["Describe the idea; answer Claude's questions in rounds", "Decide scope: must-haves, later, not doing"],
    out: ["docs/product/vision.md, prd.md, glossary.md", "Acceptance criteria per feature", "A PR that auto-merges"] },
  { n: "step 2", t: "architect", s: "PRD → architecture", cmd: "/adlc-core:architect",
    you: ["Pick between 2–3 options Claude compares", "Accept or change each ADR", "Agree which review findings to fix"],
    out: ["docs/architecture/ with ADRs, quality attributes, evolution, fitness checks", "adlc.build.yaml commands", "A PR you merge (never auto-merged)"] },
  { n: "step 3", t: "plan-backlog", s: "→ epics and issues", cmd: "/adlc-core:plan-backlog  (later: --revise)",
    you: ["Review milestones, epics, issue table and the dependency graph", "Split, merge, reorder; approve before anything is created"],
    out: ["GitHub milestones, epics and sub-issues", "blocked-by dependencies, adlc:ready / queued labels", "Owner tasks assigned to you"] },
  { n: "ongoing", t: "deliver", s: "issue → merged PR", cmd: "/adlc-core:deliver <n>  (the poller runs it for you)",
    you: ["Answer needs-info questions, do owner tasks", "Approve high-risk PRs (the merge train merges them)", "Steer from the dashboard: Run next, epics, pause"],
    out: ["Spec, design, tests first, code, verify, e2e, review", "A PR per issue with evidence and AC → test mapping", "Low/medium risk merges itself when CI is green"] },
]
let flowSel = 4
function renderFlow() {
  $("#flow").innerHTML = FLOW.map((f, i) => `<button type="button" aria-pressed="${i === flowSel}" data-i="${i}"><span class="n">${f.n}</span><span class="t">${f.t}</span><span class="s">${f.s}</span></button>`).join("")
  const f = FLOW[flowSel]
  $("#flow-detail").innerHTML = `
    <div><p class="k">Command</p>${codeBlock(f.cmd)}<p class="k" style="margin-top:14px">You</p><ul>${f.you.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div><p class="k">Result</p><ul>${f.out.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`
}
$("#flow").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { flowSel = +b.dataset.i; renderFlow() } })
renderFlow()

/* ── Simulator ─────────────────────────────────────────────────── */
const PHASES = ["Setup", "Understand", "Design", "Tests first", "Build", "Verify", "QA (e2e)", "Review", "Release"]
const PHASE_NOTE = [
  "branch adlc/178-…, label adlc:in-progress",
  "codebase-scout maps the code; requirements-analyst writes spec.md",
  "feature-architect writes design.md and tasks, and sets the risk tier",
  "test-designer writes failing acceptance tests",
  "implementers work in parallel, each in its own worktree",
  "build-runner runs lint, typecheck, arch checks and tests; debugger fixes, up to 3 attempts (re-checks run only the failures; one full run before release)",
  "qa-engineer runs the e2e flows on web and Android",
  "code-reviewer and security-reviewer, in parallel",
  "release-manager opens the PR with the evidence",
]
let S, LOG
function fresh() {
  S = { label: "queued", blockers: 1, risk: "medium", phase: -1, priority: false, pr: null, rework: 0, review: false, archived: 0, done: false, resume: false }
  LOG = [{ who: "poller", text: "#178 is <b>adlc:queued</b>: it's blocked by #177, which isn't merged yet. Nothing starts it until #177 closes." }]
}
const log = (who, text) => LOG.unshift({ who, text })

function labelsOf() {
  const l = []
  if (S.done) return [["done", "closed · merged"]]
  l.push([S.label, "adlc:" + S.label])
  if (S.review) l.push(["needs-human-review", "adlc:needs-human-review"])
  if (S.priority) l.push(["priority", "adlc:priority"])
  l.push(["queued", "adlc:risk-" + S.risk])
  return l
}

function actions() {
  const A = []
  const a = (who, title, sub, fn) => A.push({ who, title, sub, fn })
  if (S.done) { a("you", "Start over", "Run the demo again", () => fresh()); return A }
  switch (S.label) {
    case "queued":
      if (S.blockers) a("ci", "#177 merges", "Its PR goes green and merges; the issue closes", () => {
        S.blockers = 0; S.label = "ready"
        log("poller", "#177 closed, so nothing blocks #178 any more: relabelled <b>adlc:ready</b>.")
      })
      else a("poller", "Next poller cycle", "Within a minute", () => { S.label = "ready"; log("poller", "Nothing blocks #178: relabelled <b>adlc:ready</b>. The next run starts from the current main.") })
      break
    case "ready":
      if (!S.priority) a("you", "Run next", "Dashboard → Queue tab", () => { S.priority = true; log("you", "Clicked <b>Run next</b>: label adlc:priority. #178 starts before every other ready issue once a run slot is free.") })
      a("poller", "A run slot frees up", "Poller launches the delivery agent", () => {
        const wasPrio = S.priority; S.priority = false; S.label = "in-progress"
        if (S.pr) { S.phase = 5; log("poller", `Rework run: <code>claude -p "/adlc-core:deliver 178"</code> in the same worktree. It reads the failure comment and fixes the same PR.`) }
        else if (S.resume) { log("poller", "Resumed <code>/adlc-core:deliver 178</code> from the phase where it stopped."); S.resume = false }
        else { S.phase = 0; log("poller", `Started <code>claude -p "/adlc-core:deliver 178"</code> in its own worktree${wasPrio ? " (Run next removed: it has started)" : ""}.`) }
      })
      break
    case "in-progress":
      if (S.phase < PHASES.length - 1) {
        a("agent", `Finish “${PHASES[S.phase]}”`, PHASE_NOTE[S.phase], () => { S.phase++; log("agent", `${PHASES[S.phase - 1]} done; branch pushed. Now: <b>${PHASES[S.phase]}</b>.`) })
        if (S.phase <= 2) a("agent", "Needs a product decision", "The spec has a question only you can answer", () => { S.label = "needs-info"; S.resume = true; log("agent", "Posted the questions on the issue and set <b>adlc:needs-info</b>. The run stops here and resumes from this phase.") })
        if (S.phase === 5) a("agent", "Verify fails 3 times", "The debugger runs out of attempts", () => { S.label = "blocked"; S.resume = true; log("agent", "Posted a summary (phase, reason, report paths) and set <b>adlc:blocked</b>.") })
      } else {
        a("agent", S.pr ? "Push the fix to the PR" : "Open the pull request", PHASE_NOTE[8], () => {
          S.label = "pr-open"; S.phase = -1
          if (!S.pr) {
            S.pr = { n: 204, checks: "running", approved: false, stale: false }
            S.review = S.risk === "high"
            log("agent", `Opened <b>PR #204</b> with the spec, risk reason, AC → test mapping and review verdicts. Label <b>adlc:pr-open</b>${S.review ? " and <b>adlc:needs-human-review</b> (high risk: you review and approve)" : ""}.`)
          } else {
            S.pr.checks = "running"
            if (S.pr.approved) { S.pr.stale = true; log("agent", "Pushed a code fix to PR #204. Your approval was on an older commit, so it no longer holds.") }
            else log("agent", "Pushed the fix to PR #204; CI runs again.")
          }
        })
      }
      break
    case "needs-info":
      a("you", "Answer and relabel adlc:ready", "Reply on the issue, then change the label", () => { S.label = "ready"; log("you", "Answered on the issue and relabelled <b>adlc:ready</b>.") })
      break
    case "blocked":
      a("you", "Fix the cause, relabel adlc:ready", "Clarify the issue, fix the environment or a tbd setting", () => { S.label = "ready"; log("you", "Fixed the cause and relabelled <b>adlc:ready</b>.") })
      break
    case "pr-open": {
      const pr = S.pr
      if (pr.checks === "running") {
        a("ci", "Checks pass", "lint, typecheck, tests, e2e on the self-hosted runners", () => {
          pr.checks = "green"
          if (S.risk !== "high") { S.done = true; S.label = "done"; log("ci", "All required checks green."); log("poller", `Risk ${S.risk}: GitHub auto-merge squash-merged PR #204. #178 closed; the issues it blocked become <b>ready</b>.`) }
          else log("ci", "All required checks green. High risk: waits for your approval.")
        })
        a("ci", "A check fails", "A test or build step fails", () => {
          pr.checks = "red"
          if (S.rework < 2) { S.rework++; S.label = "ready"; log("ci", "A required check failed."); log("poller", `Commented the failed checks on PR #204 and relabelled #178 <b>adlc:ready</b>: rework ${S.rework} of 2. Rework runs before new issues.`) }
          else { S.review = true; log("ci", "A required check failed."); log("poller", "Rework budget used up (2 per PR): set <b>adlc:needs-human-review</b>. Look at the failure yourself.") }
        })
      } else if (pr.checks === "green" && S.risk === "high") {
        if (!pr.approved || pr.stale) a("you", pr.stale ? "Approve again" : "Approve the PR", "GitHub → Files changed → Review changes → Approve", () => {
          pr.approved = true; pr.stale = false; S.review = false
          log("you", "Approved PR #204. The merge train queues it in approval order.")
        })
        if (pr.approved && !pr.stale) {
          a("train", "Merge train reaches #204", "Front of the train: update, green checks, merge", () => {
            S.done = true; S.label = "done"
            log("train", "Brought PR #204 up to date with main, waited for green checks and squash-merged it with the App. #178 closed.")
          })
          a("agent", "Agent adds only run records", "A commit touching .adlc/ only", () => log("train", "The new commit only touches <code>.adlc/</code> run records: your approval still holds."))
          a("ci", "Another PR merges first", "main moves on; #204 is behind", () => { pr.checks = "running"; log("poller", "PR #204 is behind main: merged main into it (a clean merge keeps your approval). Checks run again.") })
        }
      }
      if (pr.checks === "red" && S.review) a("you", "Fix it and re-run the checks", "Push a fix yourself, or re-run a job that failed for environment reasons", () => {
        pr.checks = "running"; S.review = S.risk === "high" && !pr.approved
        log("you", "Re-ran the failed checks on PR #204.")
      })
      a("you", "Close the PR without merging", "To redo the issue from scratch", () => {
        S.archived++; S.pr = null; S.review = false; S.rework = 0; S.label = "queued"; S.blockers = 0; S.phase = -1
        log("you", "Closed PR #204 without merging.")
        log("poller", "Archived the branch as <code>adlc-closed/178-pr204</code>, removed the workspace and put #178 back to <b>adlc:queued</b>. The next run starts from the current main.")
      })
      break
    }
  }
  return A
}

function renderSim() {
  $("#risk").innerHTML = ["low", "medium", "high"].map((r) => `<button type="button" aria-pressed="${S.risk === r}" data-r="${r}" ${S.pr ? "disabled title='Set by the feature-architect before the PR opens'" : ""}>${r}</button>`).join("")
  $("#labels").innerHTML = labelsOf().map(([c, t]) => `<span class="lbl c-${c}">${esc(t)}</span>`).join("")
  $("#meta").innerHTML = `<dt>Blocked by</dt><dd>${S.blockers ? "#177 (open)" : "nothing open"}</dd><dt>Epic</dt><dd>#175 Merge-friendly layout</dd><dt>Reworks</dt><dd>${S.rework} of 2</dd>`
  const inRun = S.label === "in-progress" || ((S.label === "needs-info" || S.label === "blocked") && S.phase >= 0)
  $("#phasebox").hidden = !inRun
  if (inRun) {
    $("#phases").innerHTML = PHASES.map((p, i) => `<span class="phase ${i < S.phase ? "done" : i === S.phase ? (S.label === "in-progress" ? "now" : "done") : ""}" title="${p}"></span>`).join("")
    $("#phase-name").textContent = `Phase ${S.phase + 1}/9: ${PHASES[S.phase]}${S.label !== "in-progress" ? " (stopped)" : ""}`
  }
  const pr = S.pr
  $("#prbox").hidden = !pr
  if (pr) {
    const chk = { running: "● checks running", green: "✓ checks green", red: "✕ a check failed" }[pr.checks]
    $("#prbox").innerHTML = `<div class="row"><b>PR #${pr.n}</b><span class="chk ${pr.checks}">${chk}</span></div>
      <div class="row" style="color:var(--muted)">${S.risk === "high" ? (pr.approved && !pr.stale ? "Approved by you · in the merge train" : pr.stale ? "Your approval is stale: approve again" : "Waits for your approval") : "Auto-merge on (low/medium risk)"}</div>`
  }
  const A = actions()
  $("#actions").innerHTML = A.map((x, i) => `<button class="act" type="button" data-i="${i}"><span class="who ${x.who}">${x.who === "train" ? "merge train" : x.who}</span><span class="what"><span>${esc(x.title)}</span><small>${esc(x.sub)}</small></span></button>`).join("")
  $("#actions").onclick = (e) => { const b = e.target.closest(".act"); if (b) { A[+b.dataset.i].fn(); renderSim() } }
  $("#log").innerHTML = LOG.map((l) => `<li><span class="who ${l.who}">${l.who === "train" ? "merge train" : l.who}</span><span>${l.text}</span></li>`).join("")
}
$("#risk").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !S.pr) { S.risk = b.dataset.r; renderSim() } })
$("#reset").addEventListener("click", () => { fresh(); renderSim() })
fresh(); renderSim()

/* ── Tutorials ─────────────────────────────────────────────────── */
const TUTS = [
  { id: "setup", title: "Set up a dev server", when: "Once per server and project · about 30 minutes", steps: [
    { t: "Check the host", w: "dev server", b: "A Linux x86_64 host with Docker Engine and Compose v2, 50 GB+ free, <code>/dev/kvm</code> for the Android emulator.",
      c: "git clone https://github.com/kororos/adlc.git ~/adlc && cd ~/adlc\nsudo mkdir -p /srv/adlc && sudo chown \"$USER\": /srv/adlc\nsudo ln -s ~/adlc/bin/adlc /usr/local/bin/adlc\nadlc doctor" },
    { t: "Store the secrets", w: "dev server", b: "Prompted one by one and stored with mode 600. Values never go into the repo or the chat.<ul><li><code>claude_oauth_token</code>: output of <code>claude setup-token</code> (unattended runs)</li><li><code>ci_admin_pat</code>: fine-grained, this repo, Administration read/write (CI runners)</li><li><code>registry_token</code>: pull-only, for the dev deployer</li></ul>",
      c: "adlc secrets <slug>" },
    { t: "Give the agents their own GitHub identity", w: "github.com + dev server", b: "Create a GitHub App once per account (Contents, Issues, Pull requests, Workflows: read/write; Actions, Commit statuses: read; webhook off), install it on the repo, then store its key.",
      c: "adlc app <slug> --id <APP_ID> --key /tmp/app.pem && shred -u /tmp/app.pem" },
    { t: "Start the runner", w: "dev server", b: "Builds the runner image and starts the runner, its Docker engine, the egress proxy and the CI registrars.",
      c: "adlc up <slug> --repo <owner>/<slug>" },
    { t: "Log in Claude and enable Remote Control", w: "dev server", b: "One-time login, then answer “Enable Remote Control? y” in the rc window and detach with Ctrl-b d.",
      c: "adlc login <slug>\nadlc attach <slug>" },
    { t: "Open the dashboard", w: "dev server", b: "Shows what's running with its live log and progress (the step it's on, test files passed and failed so far, e2e flows, app builds), the queue, epics, dependencies, what needs you, CI and health.",
      c: "adlc ui up\nadlc ui token     # the login token" },
  ] },
  { id: "plan", title: "Plan a product", when: "Interactive sessions from the Claude app · a few hours over a few days", steps: [
    { t: "Open a Remote Control session", w: "Claude app / claude.ai/code", b: "Start a new session on the <b>adlc-&lt;slug&gt;</b> environment and wait for <b>Ready</b>. It works in <code>sessions/rc</code> on the dev server." },
    { t: "Set up the project", w: "Claude session", b: "Claude asks for your platforms and <b>stacks</b> first (react-native, react-web, node-api: see <a href=\"#stacks\">Stacks</a>), then goes section by section; or accept the defaults and review the summary. Then run the provisioning script yourself: it needs your admin login, which agents never get.",
      c: "/adlc-core:init\n! bash .adlc/provision.sh" },
    { t: "Discover the product", w: "Claude session", b: "Rounds of questions turn the idea into a vision, a PRD and acceptance criteria. Say “more ideas” or “stop suggesting” at any time.",
      c: "/adlc-core:discover A booking app for small gyms…" },
    { t: "Design the architecture", w: "Claude session", b: "Quality attributes, 2–3 options, ADRs you accept, the design, evolution triggers and fitness checks, then an independent review. Merge its PR yourself.",
      c: "/adlc-core:architect\n/adlc-core:architect --resume   # continue later" },
    { t: "Plan the backlog", w: "Claude session", b: "Review milestones, epics, the issue table and the dependency graph. Nothing is created until you approve. Use <code>--revise</code> to add work to an existing backlog.",
      c: "/adlc-core:plan-backlog" },
    { t: "Let it deliver", w: "dashboard", b: "The walking skeleton comes first; the poller then takes ready issues in dependency order. Watch it on the dashboard's <b>Now</b> tab (<b>What's happening</b>: each issue's delivery run, merge-train step and CI jobs in one row, plus the dev deploy with its publish run, and the nightly) and the <b>Queue</b> tab.",
      n: "Finish or push open session work before <code>adlc up</code> or <code>adlc restart</code>: a restart ends every app session, and old sessions don't reconnect." },
  ] },
  { id: "adopt", title: "Adopt an existing project", when: "An existing codebase · an afternoon, plus supervised first issues", steps: [
    { t: "Set up the runner for the repository", w: "dev server", b: "Same as for a new project, but with the existing repository, and install the ADLC GitHub App on it. Nothing in the repository changes yet.",
      c: "adlc secrets <slug>\nadlc up <slug> --repo <owner>/<repo>" },
    { t: "Record the setup", w: "Claude session", b: "Init detects what's there first: repository settings, branch protection, CI and required checks, Dockerfiles and registry, Expo config, Renovate or Dependabot. It proposes those values, marked <b>detected</b>. Choose the <a href=\"#stacks\">stacks</a> that match the code, or your organization's own. Then run the provisioning script.",
      c: "/adlc-core:init\n! bash .adlc/provision.sh" },
    { t: "Reconstruct the architecture", w: "Claude session", b: "A scout maps the code (modules, data, API, auth, build, tests); the architect writes the <b>as-is</b> architecture, <b>retroactive ADRs</b> and a Risks &amp; debt list. Review them carefully: from now on they bind every agent, and they override the stacks' defaults.",
      c: "/adlc-core:architect --assess" },
    { t: "Confirm the build profile", w: "dev server", b: "<code>--assess</code> drafts <code>adlc.build.yaml</code> from your scripts and CI. Run each command in the runner: the agents and CI will run exactly these.",
      c: "adlc shell <slug>" },
    { t: "Bring in work", w: "Claude session", b: "New features: discovery first maps what the product already does, then the backlog. Existing issues: bring them to the issue format and label them <code>adlc:ready</code>.",
      c: "/adlc-core:discover <feature idea>\n/adlc-core:plan-backlog" },
    { t: "Deliver the first issues under supervision", w: "Claude session", b: "Pick one or two low-risk issues and run them interactively, so you see how the agents treat your code. Then let the poller take over.",
      c: "/adlc-core:deliver <n>" },
  ] },
  { id: "steer", title: "Steer delivery", when: "Day to day · from the dashboard", steps: [
    { t: "Read the queue", w: "dashboard → Queue", b: "Issues in the order they will start: Run next, then epics on Run next, then reworks, then milestone due date and age. Each row shows what it waits for." },
    { t: "Put one issue first", w: "dashboard → Queue", b: "<b>Run next</b> on a startable issue (ready, or queued with nothing open blocking it); <b>Rework next</b> on one whose PR has conflicts or failed checks sends the PR back now and runs that rework first. It starts as soon as a run slot is free, even past the open-PR limit. A running delivery isn't interrupted." },
    { t: "Put a whole epic first", w: "dashboard → Epics", b: "<b>Run next</b> on an epic: its startable sub-issues go first until you undo it. Dependencies and the open-PR limit still apply. Expand an epic to see each sub-issue's state, queue position, blockers and PR." },
    { t: "See why something waits", w: "dashboard → Dependencies", b: "Open issues and their “blocked by” links, left to right. Hover an issue to light up its chain; click it to see only what it waits for." },
    { t: "Limit work in progress", w: "dashboard → Health → Automation", b: "<b>Rework first</b> (default on) finishes PRs that need work before new issues. <b>Limit open PRs</b> holds new issues while that many agent PRs are open, so merges don't keep causing conflicts." },
    { t: "Work on several issues at once", w: "dashboard → Health → Automation", b: "<b>Parallel runs</b> (default 1, up to 4): how many issues the agents work on at the same time. More finishes sooner, but the runs share your Claude plan's quota and the server, Android e2e still takes one run at a time, and parallel PRs conflict more often. Also <code>autonomy.max_parallel_runs</code> in adlc.yaml." },
    { t: "Choose how much the agent tests", w: "dashboard → Health → Automation", b: "<b>Tests during delivery</b>: <b>affected</b> (default) tests what the branch affects and leaves the full suite to the PR's CI; <b>full</b> runs the whole suite in the run's one full verify (later verifies re-run only the failed tests and the tests of what changed); <b>auto</b> uses full for high-risk issues and affected for the rest. Label one issue <code>adlc:verify-full</code> or <code>adlc:verify-affected</code> to override it. The <b>Now</b> tab shows which a run uses." },
    { t: "Run the nightly checks now", w: "dashboard → Health → Nightly checks", b: "<b>Run now</b> starts the nightly workflow on main (full e2e, Android, audit) without waiting for the night. A failure opens a regression issue. The workflow needs <code>repository_dispatch: { types: [adlc-nightly] }</code> under <code>on:</code>; the card says so until it has it." },
    { t: "Pause and resume", w: "dashboard or dev server", b: "Pausing stops new runs; running ones finish.", c: "adlc pause <slug>\nadlc resume <slug>" },
  ] },
  { id: "you", title: "Handle what needs you", when: "When the dashboard's Needs you count goes up", steps: [
    { t: "Answer questions", w: "GitHub issue", b: "<span class='lbl c-needs-info'>adlc:needs-info</span> Reply in a comment, then relabel <code>adlc:ready</code> (or <code>adlc:queued</code> if it still has open blockers). The run resumes from where it stopped." },
    { t: "Unblock a run", w: "GitHub issue", b: "<span class='lbl c-blocked'>adlc:blocked</span> Read the summary comment (phase, reason, report paths), fix the cause, relabel <code>adlc:ready</code>. Environment failures (runner, emulator, network) are reported, never “fixed” by changing tests." },
    { t: "Review and approve high-risk PRs", w: "GitHub PR", b: "<span class='lbl c-needs-human-review'>adlc:needs-human-review</span> Review like any PR. Approve it and the merge train merges it: updated with main, checks green, squash-merged. Low and medium risk PRs need no approval (<code>autonomy.auto_merge</code>): the train merges them once green. If code changes after your approval, ADLC asks you to approve again (Review changes → Approve)." },
    { t: "Do your owner tasks", w: "GitHub issue", b: "<span class='lbl c-owner'>adlc:owner</span> Accounts, credentials, infrastructure, sign-offs. Each says where to run what, with the exact commands to paste (absolute paths, a check at the end). Do the task, check its acceptance criteria, close the issue: what it blocked starts by itself." },
    { t: "Triage new issues", w: "dashboard → Needs you", b: "Flaky tests, regressions and spikes opened by agents have no pipeline state. <b>Start</b> puts one in the queue, <b>Run next</b> puts it first; close it on GitHub to drop it." },
    { t: "Redo an issue from scratch", w: "GitHub PR", b: "Close its agent PR without merging. The poller archives the branch as <code>adlc-closed/&lt;n&gt;-pr&lt;PR&gt;</code>, removes the workspace and requeues the issue; the next run starts from the current main." },
  ] },
  { id: "ci", title: "Add a CI-only host", when: "When CI and agents compete for CPU · about an hour", steps: [
    { t: "Create the VM", w: "hypervisor", b: "On a different physical host: 8 vCPU (6 if the host has ≤ 8 cores), 24 GB RAM fully reserved, 150 GB SSD, hardware virtualisation exposed to the guest (for <code>/dev/kvm</code>), Ubuntu LTS with Docker CE. Outbound internet only; no inbound ports." },
    { t: "Install ADLC", w: "new VM", b: "Only <code>ci_admin_pat</code> is needed there (add Contents: read so the proxy can read adlc.yaml); press Enter for the other secrets.",
      c: "sudo mkdir -p /srv/adlc && sudo chown \"$USER\": /srv/adlc\ngit clone https://github.com/kororos/adlc ~/adlc && sudo ln -s ~/adlc/bin/adlc /usr/local/bin/adlc\nadlc doctor\nadlc secrets <slug>" },
    { t: "Start the CI roles", w: "new VM", b: "Roles are <code>test</code>, <code>publish</code> and <code>kvm</code> (Android). Capacity is per host; an Android job counts 2, a test job 1, and test jobs run side by side up to the slots (<code>ADLC_CI_PARALLEL</code> caps them).",
      c: "adlc up <slug> --ci-only --repo <owner>/<slug> --ci-roles test,kvm --ci-host ci2\necho 'ADLC_CI_SLOTS=3' >>/srv/adlc/config/<slug>.env && adlc up <slug>\nadlc logs <slug> ci     # each registrar: runner … waiting for a job" },
    { t: "Hand roles over on the main host", w: "dev server", b: "Once no Android job runs there, drop kvm and free its disk. The roles you pass are remembered; later updates need no flag.",
      c: "adlc up <slug> --ci-roles test,publish\ndocker volume rm adlc-<slug>_ci-data-kvm adlc-<slug>_ci-certs-kvm" },
    { t: "Show it on the dashboard", w: "both hosts", b: "The main host prints a token for the CI host (its <code>--ci-host</code> name); the CI host asks for it and then reports CPU, memory and disk every 30 s. Overview and Health show every machine.",
      c: "adlc ui host-token ci2                    # on the dev server\nadlc ui report http://adlc.<base>:<port>  # on the CI host (paste the token)\nadlc logs <slug> hoststats                # on the CI host: dashboard answered 200" },
    { t: "Check the priority", w: "dashboard → CI", b: "When a host is full, it holds capacity for waiting higher-priority roles (default kvm, publish, test), so Android jobs aren't starved by test jobs. The CI tab shows which host ran each job." },
  ] },
  { id: "update", title: "Update ADLC safely", when: "After every ADLC change · 10 minutes", steps: [
    { t: "Know what each command reloads", w: "", b: "<ul><li><code>adlc restart</code> reloads only the <b>plugins</b> (commands, agents, skills).</li><li><code>adlc up</code> rebuilds the runner image: the <b>scripts</b> (poller, merge train, queue, CI registrar, Remote Control loop).</li><li><code>adlc ui up</code> rebuilds the <b>dashboard</b>.</li></ul>" },
    { t: "Let running work finish", w: "dev server", b: "Rebuilding stops running deliveries and ends app sessions. Pause, then wait until <code>adlc status</code> shows no active runs. Push any open session work.",
      c: "adlc pause <slug>\nadlc status <slug>" },
    { t: "Pull and rebuild", w: "dev server", c: "cd ~/adlc && git pull && adlc up <slug> && adlc ui up\nadlc resume <slug>" },
    { t: "Update each CI-only host", w: "CI host", b: "Its roles are remembered.", c: "cd ~/adlc && git pull && adlc up <slug>" },
    { t: "Verify", w: "every host", b: "Doctor says whether the running runner uses this checkout's scripts. Then start a new Remote Control session in the app.",
      c: "adlc doctor     # <slug>: runner runs this checkout's scripts" },
  ] },
]
let tutSel = store.get("adlc-guide-tut", "setup")
if (!TUTS.some((t) => t.id === tutSel)) tutSel = "setup"
const doneSteps = store.get("adlc-guide-done", {})
const progress = (t) => t.steps.filter((_, i) => doneSteps[`${t.id}:${i}`]).length
function renderTut() {
  $("#tut-list").innerHTML = TUTS.map((t) => {
    const p = progress(t)
    return `<button type="button" role="tab" aria-selected="${t.id === tutSel}" data-id="${t.id}"><span class="tt">${esc(t.title)}</span><span class="tp"><span class="meter"><span style="width:${(p / t.steps.length) * 100}%"></span></span>${p}/${t.steps.length}</span></button>`
  }).join("")
  const i = TUTS.findIndex((t) => t.id === tutSel), t = TUTS[i]
  $("#tut-body").innerHTML = `<header><p class="eyebrow">Tutorial ${i + 1} of ${TUTS.length}</p><h3 style="font-size:1.4rem">${esc(t.title)}</h3><p class="when">${esc(t.when)}</p></header>
    <ol class="steps">${t.steps.map((s, k) => {
      const key = `${t.id}:${k}`, on = !!doneSteps[key]
      return `<li class="step${on ? " checked" : ""}"><input type="checkbox" id="s-${key}" data-k="${key}" ${on ? "checked" : ""} aria-label="Mark step ${k + 1} done">
        <div class="sb"><label for="s-${key}" class="st">${k + 1}. ${esc(s.t)}</label>${s.w ? `<span class="where">${esc(s.w)}</span>` : ""}${s.b ? `<div>${s.b}</div>` : ""}${s.c ? codeBlock(s.c) : ""}${s.n ? `<p class="note">${s.n}</p>` : ""}</div></li>`
    }).join("")}</ol>
    <div class="tut-foot"><button class="ghost" type="button" data-go="${i - 1}" ${i === 0 ? "disabled" : ""}>← Previous</button><button class="ghost" type="button" data-go="${i + 1}" ${i === TUTS.length - 1 ? "disabled" : ""}>Next tutorial →</button></div>`
}
$("#tut-list").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { tutSel = b.dataset.id; store.set("adlc-guide-tut", tutSel); renderTut() } })
$("#tut-body").addEventListener("change", (e) => { const k = e.target.dataset.k; if (!k) return; if (e.target.checked) doneSteps[k] = 1; else delete doneSteps[k]; store.set("adlc-guide-done", doneSteps); renderTut() })
$("#tut-body").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b && !b.disabled) { tutSel = TUTS[+b.dataset.go].id; store.set("adlc-guide-tut", tutSel); renderTut(); $("#tutorials").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }) } })
renderTut()

/* ── Labels ────────────────────────────────────────────────────── */
const LABELS = [
  ["queued", "adlc:queued", "Planned, but something it depends on is still open.", "Nothing. The poller promotes it when its blockers close."],
  ["ready", "adlc:ready", "Can start. The poller launches it when a run slot is free.", "Run next on the dashboard to put it first."],
  ["in-progress", "adlc:in-progress", "A delivery run is working on it in its own worktree; the branch is pushed after every phase.", "Follow it on the Now tab or with adlc logs <slug> run <n>. A rework shows a Rework k badge and starts at Build."],
  ["pr-open", "adlc:pr-open", "Its PR is open. Failed checks or conflicts send it back to ready for a rework, at most twice.", "Low/medium risk: nothing, it merges itself. High risk: review and approve."],
  ["needs-info", "adlc:needs-info", "The agent needs a decision. The questions are on the issue.", "Answer, then relabel adlc:ready."],
  ["blocked", "adlc:blocked", "The run gave up: retries used up or the environment failed. A summary is on the issue.", "Fix the cause, then relabel adlc:ready."],
  ["needs-human-review", "adlc:needs-human-review", "High risk, a proposed ADR, an untrusted author, or reworks used up.", "Review the PR; approve to put it in the merge train."],
  ["owner", "adlc:owner", "Your task: accounts, credentials, infrastructure, sign-offs. ADLC never runs it.", "Do it and close the issue; what it blocked starts."],
  ["priority", "adlc:priority", "Run next: on an issue, first in line; on an epic, its sub-issues first.", "Set and undo it from the dashboard."],
]
$("#lgrid").innerHTML = LABELS.map(([c, n, m, d]) => `<div class="lcard"><span class="lbl c-${c}" style="justify-self:start">${n}</span><p>${esc(m)}</p><p class="do"><b>You:</b> ${esc(d)}</p></div>`).join("")

/* ── Fix it: what to do when… ──────────────────────────────────── */
// [category, what you see, why, steps, optional code]. `x` in text renders as code.
const FIXES = [
  ["CI", "Android e2e: the app shows \"offline\", or the emulator stays unhealthy",
    "Environment, not the app. ADLC's Docker gives every container the egress proxy, and the emulator ignores NO_PROXY: it tunnels the device's connections through the proxy, which refuses the per-run hosts (`HTTP proxy handshake … 403` in its log). Separately, a restarted emulator container can't start the device again (`sudo chown … /dev/kvm` fails).",
    ["In the project's `deploy/compose.emulator.yml`, set `HTTP_PROXY`, `http_proxy`, `HTTPS_PROXY` and `https_proxy` to `\"\"` (the stack-react-native template does).", "Recreate the emulator, never restart it (command below).", "Relabel the blocked issue `adlc:ready`."],
    "docker exec adlc-<slug>-runner-1 bash -lc 'cd /srv/adlc/projects/<slug>/repo && ADLC_PROJECT_DOMAIN=<slug>.<base domain> flock \"$ADLC_LOCK_DIR/android-emulator.lock\" docker compose -p adlc-emulator -f deploy/compose.emulator.yml up -d --force-recreate --wait'"],
  ["PRs", "Every conflict rework asks you to re-approve, so approved PRs don't merge overnight",
    "Runners before 2026-11-10 treated any conflict resolution as new code and ran a full rework (about 35 minutes) for it. Current ones keep your approval while the PR still makes the same change, run a quick rework for conflicts only, and count conflicts apart (conflict_rework_max, default 5).",
    ["Update: `adlc up <slug>` (runner) and `adlc restart <slug>` (plugins).", "A PR that is adlc:needs-human-review from the old shared limit: relabel its issue `adlc:ready`.", "When the change did differ, ADLC's comment lists just those lines: review them and approve again."]],
  ["Pipeline", "An owner task's command fails: \"No such file or directory\" for /projects/<slug>/…",
    "It was written with `$ADLC_ROOT`, which exists only inside the runner; your shell doesn't have it, so the path starts at `/projects`. Agents before adlc-core 0.1.42 wrote owner tasks that way; current ones write absolute paths, ready to paste.",
    ["Replace `$ADLC_ROOT` with your ADLC root (`/srv/adlc` by default) and run the command with that path.", "Check it: `ls -l` on the file shows `-r--r--r--` and a size above 0.", "For a missing dev secret, `adlc status <slug>` (and Needs you) also shows a create command with the full path."],
    "f=/srv/adlc/projects/<slug>/secrets/dev/<name>; ls -l \"$f\""],
  ["Pipeline", "An issue never starts and isn't in the Queue",
    "The Queue lists only issues with an ADLC state label. An issue opened without one (a follow-up an agent filed, one you or a Claude session opened by hand) has no state, so the poller never starts it.",
    ["Needs you → New issues to triage lists it with a \"no label\" badge: press Start (or Run next to put it first).", "Or add `adlc:ready` on GitHub (`adlc:queued` if it has open blockers)."]],
  ["Pipeline", "A run is blocked because the issue needs setup.md, CLAUDE.md or adlc.yaml changed",
    "Those files are the project's setup record. Unattended agents can't change them; only you can, through init. The blocked comment names the section to update.",
    ["In a Claude session: `/adlc-core:init --update <section>` (e.g. `secrets` for secret file locations and modes). Confirm the values and merge its PR.", "Relabel the issue `adlc:ready`: the agent does the rest of it.", "When the issue itself asks for that change (e.g. documenting a convention in CLAUDE.md), current runs don't block: the PR lists the exact text under Owner edits needed. Commit it to the branch, then merge.", "A blocked issue relabelled ready while nothing it asked for changed (no comment, no commit, still missing) stays blocked and says what's still needed. Environmental aborts are always retried."],
    "/adlc-core:init --update secrets"],
  ["PRs", "Approved PRs were all reworked for conflicts at once, and keep needing re-approval",
    "Older runners sent every conflicting agent PR back to the agent at the same time, and let the next PR overtake one waiting for re-approval, so each merge caused new conflicts. Current runners rework a queued PR only when it reaches the front, and a PR waiting for re-approval keeps its place.",
    ["Re-approve the PR at the front of the train (Needs you → Merge train).", "The PRs behind it then merge one by one, each brought up to date (and reworked if it conflicts) when its turn comes."]],
  ["Pipeline", "After changing stacks, the agents lack a tool or a stack's conventions",
    "The runner's tools and plugins follow `adlc.yaml` only when the runner is rebuilt: `adlc restart` reloads plugins but not the image.",
    ["Merge the `stacks` change to main.", "Between deliveries: `adlc pause <slug>`, then `adlc up <slug>`, then `adlc resume <slug>`.", "Check which packs it installed. \"no stack pack for '<name>'\" means the name doesn't match a stack."],
    "docker logs adlc-<slug>-runner-1 2>&1 | grep \"stack pack\""],
  ["Pipeline", "The agents use a stack's default where your project decided otherwise",
    "Stack skills are defaults (UI kit, ORM, test runner…). Only accepted ADRs override them.",
    ["Record the decision as an ADR: `/adlc-core:architect`, or a PR adding it under `docs/architecture/adr/` with status accepted.", "The agents follow it from the next run."]],
  ["Pipeline", "An issue doesn't start after you answered its question",
    "Removing `adlc:needs-info` leaves the issue with no pipeline state. The poller only starts `adlc:ready` issues (and `adlc:queued` ones once their blockers close).",
    ["Relabel it `adlc:ready` (or `adlc:queued` if it still has open blockers), or press Start on the dashboard's Needs you tab.", "The run resumes where it stopped and reads your answer."],
    "gh issue edit <n> --add-label adlc:ready"],
  ["Pipeline", "An issue starts before its planned turn",
    "Only GitHub's blocked-by relationships hold an issue back. An order written in a comment or in backlog.md (\"after #180\") isn't read by the poller.",
    ["On the issue: Relationships → Mark as blocked by, for each issue that must go first.", "For larger changes to the order, run `/adlc-core:plan-backlog --revise`."]],
  ["Pipeline", "A regression waits behind other work",
    "Regressions (`adlc:regression`) run right after Run next, ahead of epics and milestones. One opened without a state (a nightly script that adds only `adlc:regression`) is started automatically, once. Older runner images did neither.",
    ["Press Run next on it to start it now.", "Update the runner so this happens by itself (see \"The dev server runs old code\")."]],
  ["Pipeline", "An issue being worked on shows no branch under Development on GitHub",
    "GitHub links only branches created from the issue, and PRs that say Closes #<n>. Runs started by an older runner pushed their branch with plain git, so it shows up only when the PR opens.",
    ["Current runners create the branch from the issue (gh issue develop), so it is linked from the start.", "Until then the Now tab and the abort comment name the branch.", "If the runner log says \"could not create a linked branch on GitHub\", the run used a local branch: check that the GitHub App can write contents."]],
  ["Pipeline", "Agents spend long stretches in sleep while tests or the Android e2e run",
    "Older plugins checked long background jobs with fixed sleeps (sleep 540; tail …), which wait their full length even when the job finished a minute in: 10 to 30 minutes per test-heavy run.",
    ["Current runners have adlc-bg (start a job detached; its log ends with EXIT_CODE=<n>) and adlc-wait (returns as soon as the job ends), and the agents use them; the guard hook rejects any sleep of 60 s or more and points the agent to them.", "Load both: adlc up <slug> for the helpers in the runner image, then adlc restart <slug> for the agents."],
    "adlc up diet && adlc restart diet"],
  ["Pipeline", "Android QA takes 30 minutes or more per attempt, and other runs wait for the emulator",
    "Usually the project's e2e script: a full native rebuild every time (expo prebuild --clean, 10 to 20 minutes) while it holds the emulator lock, every flow instead of smoke plus the affected ones, and 3 retries of a flow that fails the same way.",
    ["Open a project issue following the stack-react-native e2e-patterns rules: build before taking the lock, rebuild natively only when the native fingerprint changed, take the flow selection, reseed only what a flow uses.", "ADLC's QA already stops after two identical failures (same step, same error), even when the project allows 3 attempts."]],
  ["PRs", "The merge train says a PR needs you, but its issue is adlc:ready with a rework queued",
    "Older runners kept adlc:needs-human-review when a rework of another kind was queued after one kind's automatic reworks were used up (failed checks, then conflicts), and the train went by that label.",
    ["Current runners drop the label when they queue a rework and show the PR as waiting for the agent.", "On an older runner, remove adlc:needs-human-review from the issue; the queued rework then runs and the PR is no longer marked as needing you."],
    "gh issue edit <n> --remove-label adlc:needs-human-review"],
  ["Pipeline", "A run ends with \"ended unexpectedly (exit 124)\"",
    "Exit 124 is the run's time limit: `ADLC_RUN_TIMEOUT` (default 4h) stopped it and the issue is `adlc:blocked`. Its commits are pushed and `state.json` records the phase, so nothing is lost.",
    ["Relabel the issue `adlc:ready`: it resumes from the recorded phase.", "If the project's issues are often this large, raise the limit for it (a `timeout` duration such as 6h or 360m), or split such issues."],
    "gh issue edit <n> --remove-label adlc:blocked --add-label adlc:ready\necho 'ADLC_RUN_TIMEOUT=6h' >>/srv/adlc/config/<slug>.env && adlc up <slug>"],
  ["Pipeline", "The dev server is busy: which container uses the CPU?",
    "Agents' test environments, the dev deployment and the shared Android emulator run inside the agents' Docker engine (`adlc-<slug>-docker-1`); CI jobs inside the CI engines. The host's `docker stats` shows only the engine. Inside it, `adlc-<n>-*` is issue n's run, `diet-dev-*` the dev deployment, `adlc-emulator` the emulator (kept running on purpose: about 20% of a core idle). Test environments of closed issues, including task agents' `adlc-<n>-t<k>`, are removed by the poller within about 10 minutes (older runner images missed the task ones).",
    ["Find the engine that's busy on the host, then look inside it.", "To stop the emulator until the next Android test needs it: compose down on `adlc-emulator`."],
    "docker stats --no-stream\ndocker exec adlc-<slug>-docker-1 docker stats --no-stream\ndocker exec adlc-<slug>-ci-docker-1 docker stats --no-stream\ndocker exec adlc-<slug>-docker-1 docker compose -p adlc-emulator down"],
  ["Pipeline", "An issue stays blocked after you closed its PR",
    "Closing an agent PR without merging archives the branch as `adlc-closed/<n>-pr<PR>`, removes the workspace and puts the issue back to `adlc:queued`, also when it was `adlc:blocked` or `adlc:needs-human-review`. Older runner images handled only `adlc:pr-open`.",
    ["Relabel the issue `adlc:queued` yourself.", "Update the runner."],
    "gh issue edit <n> --remove-label adlc:blocked --add-label adlc:queued"],
  ["Pipeline", "Health shows Remote Control \"login required\"",
    "Only interactive sessions (Remote Control, the Claude app) use that login. Unattended deliveries use the `claude_oauth_token` secret and keep running.",
    ["Log in again on the dev server."],
    "adlc login <slug>"],
  ["Pipeline", "The Claude app can't reconnect after a restart",
    "Every runner restart registers a new Remote Control environment; old sessions don't reconnect.",
    ["Start a new session on the online adlc-<slug> environment.", "Right after a restart it can say \"folder already served\" for about 3 minutes; wait for Ready.", "Send `/adlc-core:<phase> --resume` to continue a planning phase."]],
  ["PRs", "A PR asks you to re-approve, but GitHub still shows your approval",
    "Your approval holds while the PR still makes the same change (the same lines added and removed compared with main, carried onto a newer main, also through resolved conflicts), and through clean merges of the base and `.adlc/` run records. New code, or a resolution that changed the PR's own lines, makes it stale; ADLC also turns off the PR's auto-merge until you re-approve.",
    ["ADLC's comment lists the lines of the PR's own change that differ: review those (the compare link has every change since). After a conflict, the comment also shows only the agent's resolutions (what it changed compared with git's own merge): usually all you need to check.", "Files changed → Review changes → Approve. GitHub accepts it although the old approval still shows."]],
  ["PRs", "An approved PR conflicts and never leaves the merge train",
    "The PR used up its automatic reworks: it says \"Leaving it to a person\" and its issue is `adlc:needs-human-review`, so no agent acts on it. The train shows it as \"needs you\" and merges later PRs meanwhile (older runner images keep it at the front, and every later PR \"waits for\" it).",
    ["Relabel the issue adlc:ready for one more agent rework, or resolve the conflicts on the branch yourself.", "Re-approve the PR once it's updated: the train then merges it."],
    "gh issue edit <n> -R <owner>/<repo> --remove-label adlc:needs-human-review,adlc:blocked,adlc:pr-open --add-label adlc:ready"],
  ["PRs", "The train's front PR says the agent resolves it, but nothing runs",
    "Its automatic reworks are used up, but its issue never got adlc:needs-human-review (the relabel failed, e.g. during a GitHub outage). No agent acts on it and the PRs behind it wait. Current runners retry the relabel and let later PRs go ahead.",
    ["Add adlc:needs-human-review to the issue: the train shows it as \"needs you\" and merges the PRs behind it.", "Or relabel it adlc:ready for one more agent rework."],
    "gh issue edit <n> -R <owner>/<repo> --add-label adlc:needs-human-review"],
  ["PRs", "You relabelled an issue adlc:ready, but the train still says reworks used up",
    "Older runners went by the rework counter alone. Current ones show the PR as \"the agent resolves them\" while its issue is adlc:ready, queued or being delivered.",
    ["Nothing to do: the rework runs once a slot is free, and shows on Now.", "Re-approve the PR once the rework has updated it."]],
  ["PRs", "The train says the agent reworks a PR, but its issue is adlc:blocked",
    "A rework found nothing to fix (usually only a flaky test failed) and blocked the issue; its comment says which check to re-run. Current runners show the PR as \"needs you\" with that advice, and later PRs go ahead.",
    ["Re-run the failed jobs on the PR: if they pass, the train merges it.", "Relabel the issue adlc:ready if you want the agent to try again."],
    "gh run rerun <run> --failed -R <owner>/<repo>"],
  ["Pipeline", "The poller log fills with \"too many unreachable loose objects\"",
    "Git's automatic cleanup of the project clone failed once and left .git/gc.log; git then skips it and warns on every fetch. Housekeeping now removes gc.log and prunes the clone.",
    ["Wait for the next housekeeping (every 6 h), or clean it by hand on the host."],
    "rm /srv/adlc/projects/<slug>/repo/.git/gc.log && git -C /srv/adlc/projects/<slug>/repo gc --prune=1.hour.ago"],
  ["PRs", "The train says \"GitHub refused the merge\", but the PR is merged",
    "GitHub merged it and still answered the merge call with an error, as during its incidents. Current runners check the PR's state after an error and record it as merged.",
    ["Nothing to do: the card disappears on the train's next pass."]],
  ["CI", "Dev waits for CI to publish, and there's no publish run",
    "No workflow ran for that push to main: GitHub dropped the push event, as during its incidents, so the images are never built. Now's dev deploy line says so.",
    ["Wait a little: GitHub sometimes delivers it late.", "Otherwise push a new commit to main (the next merge does it too).", "To start it by hand next time, add workflow_dispatch: to the publish workflow's on: (a project issue), then Actions → publish → Run workflow."]],
  ["PRs", "Approved PRs merge slowly: after each merge the others wait for a full CI run",
    "Branch protection's \"Require branches to be up to date before merging\" makes the merge train update every approved PR with main and re-run its checks after each merge, although most PRs don't touch what the previous one changed.",
    ["Turn off \"Require branches to be up to date before merging\" on main (Settings → Branches). Keep the required checks.", "Health → Automation → Update before merge: only on overlap. Green PRs then merge as they are, unless main changed files they change too, or lockfiles, migrations or CI config (autonomy.merge_train_always_update).", "main's own CI still runs after every merge; a failure becomes a regression issue that runs first."],
    "# adlc.yaml\nautonomy:\n  update_before_merge: overlap"],
  ["Pipeline", "Issues take hours, mostly in Verify",
    "With Tests during delivery on full (verify_scope: full), the run's full verify runs the whole test suite, and a failure in a test the change never touched sends the run into another debug and verify round.",
    ["Health → Automation → Tests during delivery: affected (the default). The agent tests what the branch affects, retries a failure in an untouched test file once and reports it as flaky.", "The full suite still runs in the PR's CI before anything merges; a red CI goes back to the agent.", "Each run does one full (or affected) verify; later ones re-run only the failed tests and what changed. If runs still repeat the full suite, load the newer plugins: adlc restart <slug>.", "Keep a risky issue on the full suite: label it adlc:verify-full (adlc:verify-affected does the opposite). It applies when the next run or rework starts."],
    "# adlc.yaml\nautonomy:\n  verify_scope: affected"],
  ["PRs", "An approved, green PR is behind main and never merges",
    "The merge train only reports what it would do in `dry-run`, the default.",
    ["Switch it on (or Health → Automation on the dashboard).", "It then updates the front PR, waits for its checks and squash-merges, one PR at a time."],
    "adlc train <slug> on"],
  ["PRs", "A blocked PR gets merge conflicts, or a rework repeats an old conclusion",
    "The poller sends a conflicting PR back to the agent even when its issue is `adlc:blocked`, and the run is told `--conflicts`. Every rework reads the PR's current checks and mergeability and new comments on both the issue and the PR. Runners from before 2026-10-26 checked conflicts only for `adlc:pr-open` and could reuse an earlier conclusion.",
    ["Relabel the issue `adlc:pr-open`: the poller posts its conflict comment and starts a rework.", "Or write the request on the PR and relabel the issue `adlc:ready`.", "A conflict resolution is new code: re-approve when it's done."],
    "gh issue edit <n> --remove-label adlc:blocked --add-label adlc:pr-open"],
  ["PRs", "A required check fails on a PR that didn't touch that code",
    "Usually a flaky test, e.g. a UI test that waits 1 s for data while the runner is busy. Its log shows the page still loading.",
    ["Re-run the failed jobs.", "Open an issue labelled `adlc:flaky` with the test name and the log lines, so it's fixed for good."],
    "gh run rerun <run-id> --failed"],
  ["CI", "Many CI jobs wait and none seem to run",
    "Runners are single-use: between two jobs there's a 20–90 s gap while a new one registers, so a snapshot can show none. A host runs as many test jobs at once as its slots allow (`adlc doctor`: \"up to N test job(s) at once\"); Android and publish run one at a time.",
    ["Check the dashboard's CI tab, or the registrar log.", "If the queue really is longer than your capacity: raise a host's slots (next item) or add a CI-only host."],
    "adlc logs <slug> ci"],
  ["CI", "CI tests time out on PRs but pass when re-run",
    "Timeouts (vitest's 5 s, a \"completes in < 2 s\" check) on a job whose runner is `adlc-<slug>-test-…` (no host name: the main host). It ran while an agent's delivery run used the same CPU.",
    ["Take the test role off the main host, so test jobs run on the CI-only host.", "Give the CI-only host room for Android and a test job, so its test runner stays online.", "Re-run the failed jobs."],
    "adlc up <slug> --ci-roles publish                                  # on the main host\necho 'ADLC_CI_SLOTS=3' >>/srv/adlc/config/<slug>.env && adlc up <slug>   # on the CI-only host\ngh run rerun <run-id> --failed -R <owner>/<repo>"],
  ["CI", "A CI host sits idle while test jobs wait",
    "CI capacity is `ADLC_CI_SLOTS` per host (default 2). An Android (kvm) job takes 2, so while one runs or waits, that host's test runner holds back. Its log says \"waiting: running CI jobs use the capacity\".",
    ["Check the host's slots: `adlc doctor` lists them per project.", "On a host with 4+ CPUs, raise the slots on that host so Android and one test job run side by side."],
    "echo 'ADLC_CI_SLOTS=3' >>/srv/adlc/config/<slug>.env && adlc up <slug>"],
  ["Dashboard", "A CI host is missing from Machines, or shows \"No report\"",
    "The main host is sampled by the dashboard itself. A CI-only host appears only after it's linked, and its tile dims when no report arrived for 3 minutes (the host is down, the reporter stopped, or its token was rotated or removed).",
    ["On the CI host, read the reporter's log: 200 is fine; 401 means the token is wrong; 000 means it can't reach the dashboard URL.", "For 401: print the token on the main host and run the report command again on the CI host."],
    "adlc logs <slug> hoststats                 # on the CI host\nadlc ui host-token <host>                  # on the main host\nadlc ui report http://adlc.<base>:<port>   # on the CI host"],
  ["CI", "Publish fails: \"findings at or above CRITICAL, or the scan failed\"",
    "The same message covers real findings and a scan that couldn't run. Read the `Total:` lines in the log first.",
    ["`CRITICAL: 0` with `FATAL … failed to download vulnerability DB`: Trivy's database mirror failed. Re-run the failed job.", "Real CRITICAL findings: they need a newer base image or a package upgrade in the Dockerfile. Open an issue for it."],
    "gh run rerun <run-id> --failed"],
  ["Dashboard", "The dashboard lacks something new, or the dev server runs old code",
    "`adlc restart` reloads only the plugins. The poller, queue, merge train and CI registrar are built into the runner image. `adlc doctor` says when an image is older than your checkout.",
    ["Pause and wait until `adlc status` shows no active run.", "Pull, rebuild the runner and the dashboard, resume.", "A CI-only host needs `git pull && adlc up <slug>` too (its roles are remembered)."],
    "adlc pause <slug>; adlc status <slug>\ncd ~/adlc && git pull && adlc up <slug> && adlc ui up && adlc resume <slug>"],
  ["Dashboard", "The dashboard opens in Chrome but not in Safari",
    "DNS-rebind protection in the router (e.g. pfSense) drops nip.io answers that point to private IPs. Chrome's secure DNS goes around the router; Safari doesn't.",
    ["Allow nip.io as a private domain in the router, or give the dashboard your own name with `adlc ui up --host <name>`.", "Flush the Mac's DNS cache."],
    "sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder"],
]
const inline = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>")
let fcat = "All"
$("#fchips").innerHTML = ["All", "Pipeline", "PRs", "CI", "Dashboard"].map((k) => `<button type="button" data-c="${k}" aria-pressed="${k === fcat}">${k}</button>`).join("")
function renderFixes() {
  const q = $("#fq").value.trim().toLowerCase()
  const rows = FIXES.filter(([c, t, w, s, code]) => (fcat === "All" || c === fcat) && (!q || [t, w, ...s, code ?? ""].join(" ").toLowerCase().includes(q)))
  $("#fixlist").innerHTML = rows.length ? rows.map(([c, t, w, s, code]) => `<details class="fix"${q ? " open" : ""}><summary><span class="ft">${esc(t)}</span><span class="fc">${c}</span></summary>
    <div class="fb"><p class="why">${inline(w)}</p><ol>${s.map((x) => `<li>${inline(x)}</li>`).join("")}</ol>${code ? codeBlock(code) : ""}</div></details>`).join("")
    : `<p class="empty">Nothing matches “${esc(q)}”.</p>`
}
$("#fq").addEventListener("input", renderFixes)
$("#fchips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; fcat = b.dataset.c; $("#fchips").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); renderFixes() })
renderFixes()

/* ── Lifecycle: the issue's states and every move between them ──── */
// Nodes: [id, label, colour class, x, y, w, caption, meaning]. Edges: [from, to, who, svg path, label at [x, y, anchor, rotate],
// short label, detail]. An edge with no path is listed in the panel but not drawn.
const LIFE_NODES = [
  ["none", "no state", "queued", 280, 20, 200, "new · flaky · spike · regression", "Not in the pipeline yet: issues you or the agents opened (flaky tests, spikes, regressions) wait for triage on the dashboard's Needs you tab."],
  ["queued", "adlc:queued", "queued", 280, 150, 200, "waits for its blockers", "Planned, but an issue it's blocked by (GitHub relationships) is still open."],
  ["ready", "adlc:ready", "ready", 280, 280, 200, "waits for a run slot", "Can start. Order: Run next, regressions, the Run-next epic, reworks, milestone due date, then oldest first."],
  ["in-progress", "adlc:in-progress", "in-progress", 280, 410, 200, "a delivery run works on it", "A run in its own worktree: understand, spec, design, build, test, review, release. The branch is pushed after every phase."],
  ["pr-open", "adlc:pr-open", "pr-open", 280, 560, 200, "PR open, checks running", "The PR is open. Low and medium risk get auto-merge; high risk (or a proposed ADR) waits for your approval, the PR labelled adlc:needs-human-review."],
  ["merged", "merged", "done", 280, 720, 200, "issue closed", "The PR merged and closed the issue. The poller removes the workspace and its test environment; what this issue blocked can start."],
  ["needs-info", "adlc:needs-info", "needs-info", 520, 410, 180, "questions on the issue", "The agent needs a decision before it can write the spec. Its questions are an issue comment."],
  ["blocked", "adlc:blocked", "blocked", 20, 480, 180, "summary on the issue", "The run gave up: retries used up, an environment failure, or it crashed. The issue comment says why and what you need to do."],
  ["needs-human-review", "adlc:needs-human-review", "needs-human-review", 530, 640, 230, "waits for you", "A person has to look: reworks used up on a PR, or an issue from someone who isn't a collaborator."],
]
const LIFE_EDGES = [
  ["none", "queued", "you", "M380,76 V150", [390, 118], "Start · blockers open", "Start on the dashboard (Needs you). It still has open blockers, so it queues."],
  ["none", "ready", "you", "M280,48 H230 V296 H280", [224, 232, "end"], "Start · no blockers", "Start on the dashboard, or relabel adlc:ready. A regression (adlc:regression) starts by itself, once."],
  ["queued", "ready", "adlc", "M380,206 V280", [390, 248], "all blockers closed", "Every issue it's blocked by is closed: the poller promotes it within a minute."],
  ["ready", "in-progress", "adlc", "M360,336 V410", [352, 378, "end"], "run slot free", "A run slot is free (max_parallel_runs) and it's next in order. Run next puts it first; max_open_prs can hold new issues (not reworks) back."],
  ["in-progress", "ready", "adlc", "M420,410 V336", [428, 378], "restart · usage limit", "Back to ready, resuming from the last pushed phase: the runner restarted mid-run, Claude's usage limit hit (backoff), or plugins failed to load (the poller also pauses)."],
  ["in-progress", "needs-info", "adlc", "M480,438 H520", [610, 486, "middle"], "needs a decision", "The requirements analyst can't write the spec without a decision: it posts its questions on the issue and stops."],
  ["needs-info", "ready", "you", "M610,410 V308 H480", [618, 360], "you answer → ready", "Answer on the issue, then relabel adlc:ready (removing needs-info alone leaves it with no state). The run resumes with your answer."],
  ["in-progress", "blocked", "adlc", "M280,450 H110 V480", [272, 442, "end"], "gave up · crashed", "Retries used up (tests, review), the environment failed, or the run ended without a result. The issue comment says why."],
  ["blocked", "ready", "you", "M60,480 V320 H280", [68, 400], "you fix → ready", "Fix the cause, then relabel adlc:ready: the run resumes from its last pushed phase. A merge conflict on a blocked issue's PR also sends it back for a rework (ADLC)."],
  ["in-progress", "pr-open", "adlc", "M380,466 V560", [390, 518], "PR opened", "The release step opens the PR (or a rework pushes its fixes) and labels the issue pr-open."],
  ["pr-open", "merged", "adlc", "M380,616 V720", [390, 660], "green → merged", "Checks pass: auto-merge for low/medium risk. High risk: you approve, then the merge train updates and merges it."],
  ["pr-open", "ready", "adlc", "M480,575 H800 V296 H480", [812, 440, "middle", 90], "checks failed or conflicts → rework", "A required check failed or the PR conflicts with main: the poller comments on the PR and sends the issue back for a rework, at most twice per PR for failed checks (ci_rework_max) and 5 times for conflicts (conflict_rework_max). A conflicts-only rework is quick: resolve, check what it touched, push. You can also relabel ready yourself after a review with requests."],
  ["pr-open", "needs-human-review", "adlc", "M480,600 H640 V640", [488, 592], "reworks used up", "Checks still fail or conflicts remain after the automatic reworks: it's left to you."],
  ["needs-human-review", "merged", "you", "M640,696 V748 H480", [648, 728], "you approve → train", "Review and approve the PR: the merge train brings it up to date and merges it. Changes after your approval need a new approval."],
  ["pr-open", "queued", "you", "M280,600 H10 V178 H280", [18, 622], "PR closed unmerged → start over", "Close the PR without merging (also from blocked or needs-human-review): the branch is archived as adlc-closed/<n>-pr<PR>, the workspace removed, and the next run starts from main."],
  ["pr-open", "merged", "you", null, null, "", "A PR that merged with Refs #<n> (not Closes) leaves the issue open, e.g. when ACs can only be checked on dev: ADLC relabels it adlc:owner with a comment. Check what's left and close the issue."],
  ["ready", "needs-human-review", "adlc", null, null, "", "The author isn't a collaborator: it isn't run automatically."],
  ["needs-human-review", "ready", "you", null, null, "", "Remove needs-human-review and add adlc:ready to approve an outside author's issue, or to give a PR another rework."],
]
let lifeSel = store.get("life-sel", "pr-open")
if (!LIFE_NODES.some((n) => n[0] === lifeSel)) lifeSel = "pr-open"
function renderLife() {
  const byId = Object.fromEntries(LIFE_NODES.map((n) => [n[0], n]))
  const near = new Set(LIFE_EDGES.filter((e) => e[0] === lifeSel || e[1] === lifeSel).flatMap((e) => [e[0], e[1]]))
  const edges = LIFE_EDGES.filter((e) => e[3]).map(([f, t, who, d, at, text]) => {
    const [x, y, anchor = "start", rot] = at
    return `<g class="edge ${who === "you" ? "you" : ""} ${f === lifeSel || t === lifeSel ? "on" : ""}"><path d="${d}"/>` +
      `<text x="${x}" y="${y}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ""}>${esc(text)}</text></g>`
  }).join("")
  const nodes = LIFE_NODES.map(([id, label, c, x, y, w, cap]) =>
    `<g class="node c-${c} ${id === lifeSel ? "sel" : near.has(id) ? "near" : ""}" data-id="${id}" tabindex="0" role="button" aria-pressed="${id === lifeSel}" aria-label="${esc(label)}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="56" rx="10" stroke="currentColor"${id === "none" ? ' stroke-dasharray="5 4"' : ""}/>` +
    `<text class="t" x="${x + w / 2}" y="${y + 24}" text-anchor="middle">${esc(label)}</text>` +
    `<text class="s" x="${x + w / 2}" y="${y + 43}" text-anchor="middle">${esc(cap)}</text></g>`).join("")
  const marker = (id, color) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`
  $("#life-chart").innerHTML = `<svg viewBox="0 0 840 790" role="group" aria-label="Issue lifecycle">` +
    `<defs>${marker("arr", "var(--muted)")}${marker("arr-you", "var(--l-review)")}</defs>${edges}${nodes}` +
    `<g class="note"><rect x="20" y="700" width="220" height="62" rx="10"/><text x="34" y="726">adlc:owner tasks and epics</text><text x="34" y="746">are never run by agents.</text></g></svg>`
  $("#life-chart").classList.add("focus")
  const n = byId[lifeSel]
  const item = (e, other) => `<li><span class="who ${e[2] === "you" ? "you" : ""}">${e[2] === "you" ? "you" : "ADLC"}</span><span><span class="to">${esc(byId[other][1])}</span>: ${inline(e[6])}</span></li>`
  const out = LIFE_EDGES.filter((e) => e[0] === lifeSel), inc = LIFE_EDGES.filter((e) => e[1] === lifeSel)
  $("#life-panel").innerHTML = `<span class="lbl c-${n[2]}" style="justify-self:start">${esc(n[1])}</span><p>${inline(n[7])}</p>` +
    (inc.length ? `<h3>Gets here from</h3><ul>${inc.map((e) => item(e, e[0])).join("")}</ul>` : "") +
    (out.length ? `<h3>Leaves to</h3><ul>${out.map((e) => item(e, e[1])).join("")}</ul>` : `<p class="lede">The end: nothing moves it from here.</p>`)
}
function pickLife(id) { if (!id) return; lifeSel = id; store.set("life-sel", id); renderLife() }
$("#life-chart").addEventListener("click", (e) => pickLife(e.target.closest(".node")?.dataset.id))
$("#life-chart").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return
  const id = e.target.closest(".node")?.dataset.id
  if (id) { e.preventDefault(); pickLife(id); $(`#life-chart .node[data-id="${id}"]`)?.focus() }
})
renderLife()

/* ── Commands ──────────────────────────────────────────────────── */
const CMDS = [
  ["adlc doctor", "host", "Host checks: Docker, /dev/kvm, disk, secrets, whether each runner runs this checkout's scripts, and each project's CI roles, slots and test jobs at once on this host (warns when the test runner would stop during Android jobs, or the running registrars use another slot count)."],
  ["adlc secrets <slug>", "host", "Enter or update the project's secrets (stored mode 600, never shown)."],
  ["adlc up <slug> [--repo o/r] [--ci-roles …]", "host", "Build the runner image and start or update everything. Loads new ADLC scripts. Remembers CI roles."],
  ["adlc up <slug> --stacks a,b", "host", "Build the runner with these stacks' tools for this run instead of adlc.yaml's stacks (e.g. to try one)."],
  ["adlc up <slug> --ci-only --ci-roles test,kvm --ci-host ci2", "CI host", "Run only CI registrars and their engines on a second machine."],
  ["adlc ui host-token <host> [--rotate|--remove]", "host", "Token a CI-only host uses to report its CPU, memory and disk to the dashboard."],
  ["adlc ui report <dashboard url>", "CI host", "Report this CI-only host's CPU, memory and disk to the dashboard (asks for the host token)."],
  ["adlc restart <slug> [--force]", "host", "Restart the runner: reloads plugins only, ends app sessions. Warns when the image is out of date."],
  ["adlc login <slug>", "host", "One-time Claude login for Remote Control (also after it expires)."],
  ["adlc attach <slug>", "host", "tmux with the rc, poller, deployer and shell windows (detach: Ctrl-b d)."],
  ["adlc session <slug> [name]", "host", "Interactive Claude session in its own worktree, also reachable from the app."],
  ["adlc session <slug> --run <n> [--takeover]", "host", "Session inside run #n's worktree; --takeover stops the unattended run."],
  ["adlc status <slug> [--all]", "host", "Containers, active runs, pause state and the open work in order."],
  ["adlc logs <slug> [poller|deployer|rc|ci|hoststats|run <n>]", "host", "Follow a component's log, or a run's narrative and cost."],
  ["adlc pause <slug> / adlc resume <slug>", "host", "Stop or start launching new runs; running ones finish."],
  ["adlc train <slug> [on|dry-run|off]", "host", "Show or switch the merge train, live."],
  ["adlc ui up / adlc ui token", "host", "Build and start the dashboard; show its login token."],
  ["adlc audit <slug>", "host", "Domains reached through the egress proxy and whether each is allowed."],
  ["adlc down <slug>", "host", "Stop the project; workspace, volumes and login are kept."],
  ["/adlc-core:init [--update <section>]", "session", "Project setup: repo, CI, registry, environments, autonomy."],
  ["/adlc-core:discover <idea> [--resume]", "session", "Idea to vision, PRD, glossary and acceptance criteria."],
  ["/adlc-core:architect [--resume] [--assess]", "session", "Architecture, ADRs, quality attributes, evolution and fitness checks. --assess reconstructs an existing codebase's as-is architecture and retroactive ADRs."],
  ["/adlc-core:plan-backlog [--revise]", "session", "Milestones, epics and dependency-ordered issues, created after approval."],
  ["/adlc-core:deliver <n>", "session", "Deliver one issue (the poller runs this for you); resumes from the last phase."],
]
let where = "all"
$("#chips").innerHTML = [["all", "All"], ["host", "Dev server"], ["CI host", "CI host"], ["session", "Claude session"]].map(([k, l]) => `<button type="button" data-w="${k}" aria-pressed="${k === where}">${l}</button>`).join("")
function renderCmds() {
  const q = $("#q").value.trim().toLowerCase()
  const rows = CMDS.filter(([c, w, d]) => (where === "all" || w === where) && (!q || (c + " " + d).toLowerCase().includes(q)))
  $("#cmds").innerHTML = rows.length ? rows.map(([c, w, d]) => `<tr><td class="c">${esc(c)}</td><td class="w">${w === "host" ? "dev server" : w === "session" ? "Claude session" : w}</td><td>${esc(d)}</td></tr>`).join("")
    : `<tr><td colspan="3" class="empty">No command matches “${esc(q)}”.</td></tr>`
}
$("#q").addEventListener("input", renderCmds)
$("#chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; where = b.dataset.w; $("#chips").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); renderCmds() })
renderCmds()

// The video tutorial: an inline player under the hero. The video streams from the GitHub release (so it
// plays only once the repository is public); the subtitles are served with the guide.
const watchBtn = $("#watch-btn"), watch = $("#watch"), watchVideo = $("#watch-video")
watchBtn.addEventListener("click", () => {
  const open = watch.hidden
  watch.hidden = !open
  watchBtn.setAttribute("aria-expanded", String(open))
  watchBtn.textContent = open ? "■ Close the video" : "▶ Watch the video tutorial"
  if (open) watchVideo.play().catch(() => {})
  else watchVideo.pause()
})
// It can't load (e.g. the repository is private: GitHub answers 404): replace the empty player with the reason.
watchVideo.querySelector("source").addEventListener("error", () => {
  watchVideo.hidden = true
  $("#watch-note").hidden = true
  $("#watch-off").hidden = false
})
