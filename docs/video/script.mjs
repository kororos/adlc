// The video: scenes and their narration beats. `say` is what the voice reads (spelled for it), `cap` the
// caption on screen. Each beat's on-screen change starts with its narration.
// Shot boxes are CSS px of the 1600-wide dashboard captures (see shots/boxes.json).
import fs from "node:fs"
import path from "node:path"
const B = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "shots", "boxes.json"), "utf8"))
const pad = ([x, y, w, h], p = 16) => [x - p, y - p, w + 2 * p, h + 2 * p]

const beat = (cap, extra = {}) => ({ cap, say: extra.say ?? cap, ...extra })

export const scenes = [
  { type: "title", title: "ADLC", subtitle: "From GitHub issues to tested, reviewed pull requests, with Claude Code", beats: [
    beat("This is ADLC, the Agentic Delivery Life Cycle.", { say: "This is A D L C, the Agentic Delivery Life Cycle." }),
    beat("It turns your idea into a product spec, an architecture and a backlog of GitHub issues. Then it delivers those issues, one by one, as tested and reviewed pull requests."),
    beat("In this video you'll set it up, start a first project, and see how to work with it day to day."),
  ] },

  { type: "flow", heading: "How it works", beats: [
    beat("There are two halves."),
    beat("First, you plan with Claude: you describe the product, agree on an architecture, and Claude turns it into GitHub issues with their dependencies.", { show: "plan" }),
    beat("Then the agents deliver, unattended. A poller on your dev server picks up ready issues in dependency order.", { show: "poller" }),
    beat("For each one, a team of agents writes the spec, the design and the tests first, builds the code, verifies it, runs end-to-end checks and reviews it, then opens a pull request.", { show: "pipeline" }),
    beat("Low- and medium-risk changes merge by themselves once CI is green. High-risk changes wait for your approval.", { show: "merge" }),
  ] },

  { type: "bullets", heading: "What you need", items: [
    { icon: "✳", text: "A Claude subscription", sub: "Max recommended: unattended runs use it" },
    { icon: "⌥", text: "A GitHub account", sub: "and the gh command line, version 2.94 or later" },
    { icon: "▣", text: "A Linux dev server with Docker", sub: "runs the agents, test environments, CI runners and the dashboard · 24 GB RAM · 50 GB+ free disk" },
  ], beats: [
    beat("Here's what you need."),
    beat("A Claude subscription. Max is recommended, because unattended runs use it.", { reveal: 1 }),
    beat("A GitHub account, with the gh command line.", { reveal: 2 }),
    beat("And a Linux server with Docker: your dev server. It runs the agents, their test environments, the CI runners and a dashboard. Give it about twenty-four gigabytes of memory and fifty gigabytes of free disk.", { reveal: 3 }),
  ] },

  { type: "chapter", num: "Part 1", title: "Install", beats: [beat("Part one: install.")] },

  { type: "terminal", title: "dev-server", beats: [
    beat("On the dev server, clone the ADLC repository, link the adlc command, and create its data folder.", {
      say: "On the dev server, clone the A D L C repository, link the A D L C command, and create its data folder.",
      lines: [
        { cmd: "git clone https://github.com/kororos/adlc.git ~/adlc" },
        { cmd: "sudo ln -s ~/adlc/bin/adlc /usr/local/bin/adlc" },
        { cmd: "sudo mkdir -p /srv/adlc && sudo chown \"$USER\": /srv/adlc" },
      ] }),
    beat("Then run adlc doctor. It checks Docker, disk space and virtualisation, and tells you what's missing.", {
      say: "Then run A D L C doctor. It checks Docker, disk space and virtualisation, and tells you what's missing.",
      lines: [
        { cmd: "adlc doctor", out: ["ADLC doctor (ADLC_ROOT=/srv/adlc)", "  ✔ docker reachable", "  ✔ docker compose v2", "  ✔ /dev/kvm present (Android emulator)", "  ! sysbox not installed: DinD runs privileged (see docs)", "  ✔ /srv/adlc writable by alex", "  ✔ 212GB free"] },
      ] }),
  ] },

  { type: "bullets", heading: "Give the agents their own GitHub identity", items: [
    { icon: "1", text: "Create a GitHub App, once", sub: "Settings → Developer settings → GitHub Apps → New · webhook off" },
    { icon: "2", text: "Read & write: Contents, Issues, Pull requests, Workflows", sub: "Read-only: Actions, Commit statuses · everything else: no access" },
    { icon: "3", text: "Install it on your project's repository", sub: "and generate a private key" },
    { icon: "✓", text: "You review their PRs like a colleague's", sub: "they can't push to main and never use your admin rights" },
  ], beats: [
    beat("The agents need their own identity on GitHub, so you create a GitHub App, once.", { reveal: 1 }),
    beat("Give it read and write access to contents, issues, pull requests and workflows, and read access to actions and commit statuses. Nothing else.", { reveal: 2 }),
    beat("Install it on your project's repository, and generate a private key.", { reveal: 3 }),
    beat("Because the agents act as the app, you review and approve their pull requests like a colleague's, and they can never push to main.", { reveal: 4 }),
  ] },

  { type: "terminal", title: "dev-server", beats: [
    beat("Now create the project: an empty repository, then its secrets on the dev server.", {
      lines: [
        { cmd: "gh repo create acme/orbit --private --add-readme" },
        { cmd: "adlc secrets orbit", out: ["Secrets for 'orbit' are stored in /srv/adlc/secrets/orbit (mode 600).", "gh_pat:", "  ! gh_pat left empty", "claude_oauth_token:", "  ✔ claude_oauth_token saved (108 chars)", "ci_admin_pat:", "  ✔ ci_admin_pat saved (93 chars)", "registry_token:", "  ! registry_token left empty"] },
      ] }),
    beat("The secrets stay on the server, readable only by you. Claude never sees their values."),
    beat("Start the runner, and connect the GitHub App.", {
      lines: [
        { cmd: "adlc up orbit --repo acme/orbit" },
        { cmd: "adlc app orbit --id 1234567 --key /tmp/app.pem && shred -u /tmp/app.pem" },
      ] }),
    beat("Log in to Claude once, and enable Remote Control, so you can talk to Claude on the server from your laptop or your phone.", {
      lines: [
        { cmd: "adlc login orbit" },
        { cmd: "adlc attach orbit", out: ["rc  Ready · orbit"] },
      ] }),
    beat("Finally, start the dashboard, and get its login token.", {
      lines: [
        { cmd: "adlc ui up", out: ["  ✔ dashboard: http://adlc.lan"] },
        { cmd: "adlc ui token" },
      ] }),
  ] },

  { type: "chapter", num: "Part 2", title: "Plan your product", beats: [beat("Part two: plan your product.")] },

  { type: "claude", session: "adlc-orbit", beats: [
    beat("Open the Claude app, or claude.ai/code, and pick the session adlc-orbit. Now you're talking to Claude on the dev server.", {
      say: "Open the Claude app, or claude dot A I slash code, and pick the session A D L C orbit. Now you're talking to Claude on the dev server." }),
    beat("Run /adlc-core:init. Claude goes through the setup section by section: repository, CI, registry, environments, and what the agents may do on their own.", {
      say: "Run slash A D L C core, init. Claude goes through the setup section by section: repository, C I, registry, environments, and what the agents may do on their own.",
      msgs: [
        { who: "user", text: "/adlc-core:init" },
        { who: "claude", text: "Environments · proposed\n• dev: Docker Compose on the dev server, deployed on every merge\n• prod: Docker Swarm, deployed by you\n• agents may deploy on their own to: dev only\nWhy: keeps production in your hands. Confirm, change, or answer tbd." },
      ] }),
    beat("Each proposal comes with a reason. You confirm it, change it, or leave it to be decided later."),
    beat("It writes adlc.yaml and a setup document, and a provisioning script that you run yourself, with your own GitHub login, because the agents have no admin rights.", {
      say: "It writes A D L C dot yaml and a setup document, and a provisioning script that you run yourself, with your own GitHub login, because the agents have no admin rights.",
      msgs: [{ who: "user", text: "! bash .adlc/provision.sh" }, { who: "out", text: "✓ labels, milestones, branch protection, environments\n✓ registered on the runner" }] }),
  ] },

  { type: "bullets", heading: "Stacks: what ADLC knows about your technology", intro: "Each stack brings conventions and templates for the agents, tools on the dev server, its download hosts, and end-to-end CI jobs.", items: [
    { icon: "◆", text: "react-native", sub: "Expo apps on web, Android and iOS · Android SDK, Maestro, emulator e2e" },
    { icon: "◆", text: "react-web", sub: "desktop-first React + Vite web apps · shadcn/ui, Tailwind, Vitest, Playwright" },
    { icon: "◆", text: "node-api", sub: "Node.js APIs with Postgres and Redis · migrations, containers, Swarm deploys" },
    { icon: "+", text: "Your organization's own", sub: "its conventions for a kind of app, in your fork of ADLC · Claude writes it with you" },
  ], beats: [
    beat("One of init's first questions is which stacks your project uses. A stack is what ADLC knows about a technology.", { say: "One of init's first questions is which stacks your project uses. A stack is what A D L C knows about a technology." }),
    beat("Each one brings conventions and templates that every agent loads, the tools the agents need on the dev server, the download hosts it may reach, and its end-to-end CI jobs."),
    beat("React Native, for Expo apps on web, Android and iOS.", { reveal: 1 }),
    beat("React web, for desktop-first web apps.", { reveal: 2 }),
    beat("And Node API, for back ends with Postgres and Redis.", { say: "And Node A P I, for back ends with Postgres and Redis.", reveal: 3 }),
    beat("Your ADRs override any stack's defaults. And you can add your organization's own conventions as a stack: ask Claude to create one, and it interviews you and learns from a reference repository.", { say: "Your A D Rs override any stack's defaults. And you can add your organization's own conventions as a stack: ask Claude to create one, and it interviews you and learns from a reference repository.", reveal: 4 }),
  ] },

  { type: "claude", session: "adlc-orbit", beats: [
    beat("Next, describe your idea with /adlc-core:discover.", {
      say: "Next, describe your idea with slash A D L C core, discover.",
      msgs: [{ who: "user", text: "/adlc-core:discover A booking app for small gyms: members book classes on mobile, gym owners manage schedules on web" }] }),
    beat("Claude asks questions and writes a product requirements document with testable acceptance criteria.", {
      msgs: [{ who: "claude", text: "A few questions first:\n1. Can members cancel a booking? Until when?\n2. What happens when a class is full: waitlist, or just closed?\n3. Do members pay per class, or with class packs?" }] }),
    beat("Then /adlc-core:architect designs the system and records each decision as an architecture decision record.", {
      say: "Then slash architect designs the system, and records each decision as an architecture decision record.",
      msgs: [{ who: "user", text: "/adlc-core:architect" }] }),
    beat("And /adlc-core:plan-backlog breaks the work into epics and issues, with milestones and dependencies. The first issue is always a walking skeleton: one thin path from screen to API to database, with CI and a test environment.", {
      say: "And slash plan backlog breaks the work into epics and issues, with milestones and dependencies. The first issue is always a walking skeleton: one thin path from screen to A P I to database, with C I and a test environment.",
      msgs: [{ who: "user", text: "/adlc-core:plan-backlog" }, { who: "claude", text: "Created 3 milestones, 6 epics and 41 issues with dependencies.\n#1 Walking skeleton: scaffold, CI, test environment, one path screen → API → database" }] }),
    beat("Each step ends with a pull request of its documents, so everything is versioned in your repository."),
  ] },

  { type: "claude", session: "adlc-orbit", beats: [
    beat("Already have a codebase? ADLC can adopt it, and work within the architecture it already has.", { say: "Already have a codebase? A D L C can adopt it, and work within the architecture it already has." }),
    beat("Init detects what's there, like your CI, Dockerfiles, registry and repository settings, and proposes those values instead of its defaults.", {
      msgs: [
        { who: "user", text: "/adlc-core:init" },
        { who: "claude", text: "CI/CD · detected\n• .github/workflows/ci.yml: lint, test, build (required checks)\n• registry: ghcr.io/acme/orbit (pushed by the Dockerfile workflow)\nKeep these, change them, or answer tbd." },
      ] }),
    beat("Then /adlc-core:architect --assess maps the code and writes the as-is architecture, retroactive decision records, and a list of risks and technical debt.", {
      say: "Then architect, with assess, maps the code and writes the as-is architecture, retroactive decision records, and a list of risks and technical debt.",
      msgs: [
        { who: "user", text: "/adlc-core:architect --assess" },
        { who: "claude", text: "As-is architecture written, for your review:\n• 9 retroactive ADRs, e.g. 0003 Prisma for data access\n• Risks & debt: 6 items\n• adlc.build.yaml drafted from your scripts: confirm each command" },
      ] }),
    beat("From then on, every agent follows those decisions, over any stack's defaults. Start with a few low-risk issues under supervision, then let the poller take over."),
  ] },

  { type: "chapter", num: "Part 3", title: "Watch it deliver", beats: [beat("Part three: watch it deliver.")] },

  { type: "shot", img: "queue", beats: [
    beat("Open the dashboard. The Queue tab lists every open issue in the order the agents will take them.", { focus: [300, 60, 1300, 790] }),
    beat("Issues wait for their blockers. The waitlist can only start once booking is merged.", { focus: pad(B.queue.m2, 40), mark: B.queue.r21 }),
    beat("Orange items are your own tasks, like creating a secret. They unblock the issues behind them.", { focus: pad(B.queue.m2, 40), mark: B.queue.r25 }),
    beat("Run next moves an issue to the front of the line.", { focus: pad(B.queue.m2, 40), mark: B.queue.r19 }),
  ] },

  { type: "shot", img: "deps", beats: [
    beat("The Dependencies tab draws the same queue as a graph, so you can see what is holding up what.", { focus: pad(B.deps.graph, 30), mark: null }),
  ] },

  { type: "shot", img: "now", beats: [
    beat("The Now tab shows what's happening right now.", { focus: pad(B.now.activity, 40) }),
    beat("Issue 18 is being delivered: the agent is in the Build phase, step four of eight.", { focus: pad(B.now.activity, 40), mark: B.now.row18 }),
    beat("The pull request for issue 17 is in the merge train, waiting for its CI checks, and you can see which jobs are running.", { focus: pad(B.now.activity, 40), mark: B.now.row17 }),
    beat("Below, the dev deployment waits for the newest images to be published, with a link to that run.", { focus: pad(B.now.activity, 40), mark: B.now.deploy }),
    beat("Further down is the run itself: its phases, and a live log of what the agents are doing.", { focus: [376 - 30, 649 - 30, 1104 + 60, 760] }),
    beat("Each run works in its own git worktree and test environment, and tests what the change affects. The full suite runs in the pull request's CI, which must be green before anything merges.", { focus: [376 - 30, 649 - 30, 1104 + 60, 760] }),
  ] },

  { type: "shot", img: "attention", beats: [
    beat("When the agents need you, it shows up under Needs you.", { focus: [300, 60, 1300, 1000] }),
    beat("At the top, the merge train. It merges pull requests one after another, bringing each up to date and checking it first.", { focus: pad(B.attention.train, 60), mark: B.attention.train }),
    beat("High-risk changes, like payments, wait for your review. The pull request explains the spec, the risk, which test covers each acceptance criterion, and the review verdicts.", { focus: pad(B.attention.review, 60), mark: B.attention.review }),
    beat("Questions land here too. Answer on the issue, relabel it ready, and the run continues where it stopped.", { focus: pad(B.attention.question, 60), mark: B.attention.question }),
    beat("And issues the agents opened, such as a flaky test, don't start until you press Start or Run next.", { focus: pad(B.attention.triage, 60), mark: B.attention.triage }),
  ] },

  { type: "chapter", num: "Part 4", title: "Day to day", beats: [beat("Part four: day to day.")] },

  { type: "shot", img: "overview", beats: [
    beat("Day to day, ADLC runs mostly on its own. Start with the Overview.", { say: "Day to day, A D L C runs mostly on its own. Start with the Overview.", focus: [180, 40, 1300, 812] }),
    beat("It shows each project's running delivery, the pull requests to review, blocked runs and your tasks, and how busy each machine is.", { focus: [180, 40, 1300, 812], mark: [376, 151, 546, 332] }),
  ] },

  { type: "shot", img: "attention", beats: [
    beat("Then go through Needs you. Review and approve the high-risk pull requests: you only approve, and the merge train does the merging.", { focus: pad(B.attention.review, 60), mark: B.attention.review }),
    beat("Do your owner tasks, like creating the secret a new feature needs. Close the task, and the issues it blocked start by themselves.", { focus: pad(B.attention.owner, 60), mark: B.attention.owner }),
    beat("And answer the agents' questions.", { focus: pad(B.attention.question, 60), mark: B.attention.question }),
  ] },

  { type: "shot", img: "queue", beats: [
    beat("If priorities change, use Run next on an issue, or on a whole epic in the Epics tab. For lasting changes, revise the backlog with Claude.", { focus: pad(B.queue.m2, 40), mark: B.queue.r19 }),
  ] },

  { type: "shot", img: "health", beats: [
    beat("The Health tab holds the switches: the merge train, reworks on failed checks, and how much the agents test during delivery.", { focus: pad(B.health.automation, 30) }),
    beat("It shows the nightly checks, which run the exhaustive suites and open a regression issue when something breaks. You can also start them now.", { focus: pad(B.health.nightly, 120), mark: B.health.nightly }),
    beat("And the logs of the poller, the deployer and Remote Control.", { focus: [346, 1533, 1164, 700], mark: B.health.components }),
  ] },

  { type: "shot", img: "history", beats: [
    beat("History lists every run with its duration and cost, so you always know what the agents spend.", { focus: [300, 60, 1300, 812], mark: B.history.table }),
  ] },

  { type: "terminal", title: "dev-server", beats: [
    beat("From a terminal, adlc status gives you the same picture.", {
      say: "From a terminal, A D L C status gives you the same picture.",
      lines: [{ cmd: "adlc status orbit", out: ["■ orbit  (acme/orbit)", "    active runs: #18", "    dev environment: sha-4c9e21a", "    merge train:", "      PR #42 (#17): checks · risk low (no approval needed): joins once its checks are green", "       1. #18   in-progress M2  Members book a class from the mobile app", "       4. #25   owner       M2  [owner] Create the dev secret stripe_api_key  → unblocks 2"] }] }),
    beat("Pause stops new runs while the current one finishes, and resume starts them again.", {
      lines: [{ cmd: "adlc pause orbit" }, { cmd: "adlc resume orbit" }] }),
    beat("And adlc logs follows any component, or a single run.", {
      say: "And A D L C logs follows any component, or a single run.",
      lines: [{ cmd: "adlc logs orbit run 18" }] }),
  ] },

  { type: "bullets", heading: "When something goes wrong", items: [
    { icon: "↻", text: "Agents rework their own PRs", sub: "failed checks and merge conflicts go back to them, twice at most" },
    { icon: "!", text: "Then it's blocked or needs human review", sub: "with a summary of why on the issue" },
    { icon: "→", text: "Fix the cause, relabel adlc:ready", sub: "the run continues from where it stopped" },
    { icon: "⛨", text: "Agents never deploy production", sub: "you deploy releases yourself" },
  ], beats: [
    beat("When something goes wrong, the agents rework their own pull requests: failed checks and merge conflicts go back to them, twice at most.", { reveal: 1 }),
    beat("After that, or when a run gets stuck, the issue is marked blocked or needs human review, with a summary of why.", { reveal: 2 }),
    beat("Fix the cause or answer the question, relabel the issue ready, and it continues.", { reveal: 3 }),
    beat("And the agents never deploy production: you deploy releases yourself.", { reveal: 4 }),
  ] },

  { type: "shot", img: "guide", beats: [
    beat("To learn more, open the Field Guide from the dashboard's sidebar. It has an issue lifecycle simulator, tutorials, and fixes for common problems.", { focus: [0, 0, 1600, 1000] }),
  ] },

  { type: "title", title: "ADLC", subtitle: "github.com/kororos/adlc", outro: true, beats: [
    beat("That's ADLC. Describe what you want, plan it with Claude, and let the agents deliver it.", { say: "That's A D L C. Describe what you want, plan it with Claude, and let the agents deliver it." }),
    beat("You'll find everything on GitHub, at kororos/adlc.", { say: "You'll find everything on GitHub, at kororos slash A D L C." }),
  ] },
]
