// ADLC adoption deck: npm install && node build.js → ADLC-framework.pptx
// The dashboard screenshot (dashboard-orbit.png) shows synthetic data for a fictional project.
const path = require("path")
const fs = require("fs")
const pptxgen = require("pptxgenjs")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const sharp = require("sharp")
const Lu = require("react-icons/lu")
const JSZip = require(require.resolve("jszip", { paths: [require.resolve("pptxgenjs")] }))

// pptxgenjs writes Office's default palette into the theme; replace it with ours so scheme
// colors (C.accent1, …) resolve to the ADLC colors and the deck stays restylable in PowerPoint.
async function applyTheme(file, theme) {
  const slots = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]
  const zip = await JSZip.loadAsync(fs.readFileSync(file))
  const part = "ppt/theme/theme1.xml"
  const scheme = `<a:clrScheme name="${theme.name}">` + slots.map((k) => `<a:${k}><a:srgbClr val="${theme.colors[k]}"/></a:${k}>`).join("") + "</a:clrScheme>"
  const xml = (await zip.file(part).async("string"))
    .replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, () => scheme)
    .replace(/(<a:(?:theme|fontScheme)\b[^>]*?\bname=")[^"]*"/g, (_, head) => `${head}${theme.name}"`)
  zip.file(part, xml)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))
}

const THEME = {
  name: "ADLC",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1E1B4B", lt1: "FFFFFF", dk2: "312E81", lt2: "EEF0FF",
    accent1: "4F46E5", accent2: "F59E0B", accent3: "059669", accent4: "DC2626", accent5: "7C3AED", accent6: "64748B",
    hlink: "4F46E5", folHlink: "7C3AED",
  },
}
const HEX = THEME.colors
const OUT = path.join(__dirname, "ADLC-framework.pptx")
const SHOT = path.join(__dirname, "dashboard-orbit.png") // synthetic data, fictional project "orbit"

const pres = new pptxgen()
pres.layout = "LAYOUT_WIDE" // 13.333 × 7.5
pres.title = "ADLC: Agentic Delivery Life Cycle"
pres.author = "ADLC"
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace }
const C = pres.SchemeColor
const W = 13.333

// ── Layouts ──────────────────────────────────────────────────────────────────
pres.defineSlideMaster({
  title: "TITLE",
  background: { color: C.text1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.2, w: 11.5, h: 1.4, fontSize: 60, bold: true, color: C.background1, valign: "bottom", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "subtitle", type: "body", x: 0.8, y: 3.75, w: 10.5, h: 1.3, fontSize: 22, color: C.background2, valign: "top", align: "left", margin: 0 }, text: "" } },
  ],
})
pres.defineSlideMaster({
  title: "SECTION",
  background: { color: C.text1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.6, w: 11.5, h: 1.2, fontSize: 44, bold: true, color: C.background1, valign: "bottom", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.95, w: 10.5, h: 1.0, fontSize: 20, color: C.background2, valign: "top", align: "left", margin: 0 }, text: "" } },
  ],
})
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.7, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontSize: 32, bold: true, color: C.text1, valign: "middle", align: "left", margin: 0 }, text: "" } },
    { text: { text: "ADLC · internal", options: { x: 0.6, y: 7.0, w: 4, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.accent6, align: "right" },
})

// ── Helpers ──────────────────────────────────────────────────────────────────
const iconCache = new Map()
async function icon(name, hex, px = 256) {
  const key = `${name}-${hex}`
  if (iconCache.has(key)) return iconCache.get(key)
  const Comp = Lu[name]
  if (!Comp) throw new Error(`missing icon ${name}`)
  const svg = renderToStaticMarkup(React.createElement(Comp, { color: `#${hex}`, size: px }))
  const png = await sharp(Buffer.from(svg)).resize(px, px).png().toBuffer()
  const data = "image/png;base64," + png.toString("base64")
  iconCache.set(key, data)
  return data
}

// Icon in a rounded square tile (the deck's motif, like the dashboard's stat tiles).
async function iconTile(slide, name, x, y, size, tone = "accent1", objectName) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: size, h: size, rectRadius: size * 0.22, fill: { color: C[tone], transparency: 86 }, line: { type: "none" }, objectName: `${objectName ?? name} tile` })
  const pad = size * 0.24
  slide.addImage({ data: await icon(name, HEX[tone]), x: x + pad, y: y + pad, w: size - 2 * pad, h: size - 2 * pad, objectName: `${objectName ?? name} icon` })
}

function card(slide, x, y, w, h, opts = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12,
    fill: { color: opts.fill ?? C.background2, transparency: opts.transparency ?? 0 },
    line: opts.line ? { color: opts.line, width: 1 } : { type: "none" },
    objectName: opts.name ?? "card",
  })
}

function text(slide, t, x, y, w, h, o = {}) {
  slide.addText(t, { x, y, w, h, isTextBox: true, margin: 0, fontSize: 14, color: C.text1, valign: "top", ...o })
}

function content(title, section) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section })
  s.addText(title, { placeholder: "title" })
  return s
}

const MAIN = "The framework", APP = "Appendix"

async function build() {
  // ── 1. Title ───────────────────────────────────────────────────────────────
  pres.addSection({ title: MAIN })
  let s = pres.addSlide({ masterName: "TITLE", sectionTitle: MAIN })
  s.addText("ADLC", { placeholder: "title" })
  s.addText([
    { text: "Agentic Delivery Life Cycle", options: { bold: true, breakLine: true } },
    { text: "From an idea to merged, tested pull requests, delivered by a team of AI agents on our own infrastructure, with humans in charge" },
  ], { placeholder: "subtitle" })
  s.addImage({ data: await icon("LuWorkflow", HEX.lt2, 512), x: 10.6, y: 0.8, w: 1.9, h: 1.9, transparency: 70, objectName: "motif" })
  s.addNotes("ADLC is a framework that turns Claude Code into a delivery team: product discovery, architecture, backlog planning and the delivery of each issue as a reviewed pull request. It runs on our own dev server and GitHub. This deck goes from the big picture to the details; the appendix is reference material.")

  // ── 2. The pitch ───────────────────────────────────────────────────────────
  s = content("A delivery team that never sleeps, with you as the product owner", MAIN)
  text(s, "ADLC packages Claude Code into specialised agents, a repeatable process and guardrails. You describe the product and approve what matters; the agents do the specification, design, tests, code and reviews, and open a pull request for every issue.", 0.6, 1.4, 12.1, 0.9, { fontSize: 18, color: C.text2 })
  const stats = [
    ["15", "specialised agents", "each with one job, routed to the right model (Opus, Sonnet, Haiku)", "LuUsers", "accent1"],
    ["8", "phases per issue", "understand → design → tests → build → verify → QA → review → PR", "LuListOrdered", "accent5"],
    ["1 PR", "per issue", "tested and reviewed, with every acceptance criterion traced to a test", "LuGitPullRequest", "accent3"],
    ["0", "prod deploys by agents", "production is deployed by a person, always", "LuShieldCheck", "accent2"],
  ]
  for (const [i, [big, label, desc, ic, tone]] of stats.entries()) {
    const x = 0.6 + i * 3.1
    card(s, x, 2.75, 2.85, 3.6, { name: `stat ${label}` })
    await iconTile(s, ic, x + 0.3, 3.0, 0.7, tone)
    text(s, big, x + 0.3, 3.85, 2.3, 0.9, { fontSize: 48, bold: true, color: C[tone], fontFace: THEME.headFontFace })
    text(s, label, x + 0.3, 4.75, 2.3, 0.4, { fontSize: 16, bold: true })
    text(s, desc, x + 0.3, 5.2, 2.3, 1.0, { fontSize: 13, color: C.accent6 })
  }
  s.addNotes("The one-line pitch: ADLC is a delivery team made of agents. Four numbers to remember. Fifteen agents with narrow jobs, so each one is good at its job and cheap to run. Eight phases for every issue. One pull request per issue, traceable from acceptance criterion to test. And zero production deploys by agents.")

  // ── 3. Why ─────────────────────────────────────────────────────────────────
  s = content("Why ADLC: AI coding without the chaos", MAIN)
  const why = [
    ["Ad-hoc prompting", "Every session starts from zero; results depend on who prompts and how", "A fixed process: discovery → architecture → backlog → delivery, with written artefacts at each step"],
    ["Unreviewed changes", "Agents push code nobody fully read, tests written after the fact", "Tests first, AI code and security review, and a human merge for anything risky"],
    ["Agents with your keys", "Your account, your tokens, access to everything on the machine", "A sandbox per project, its own GitHub identity, an internet allowlist, no prod access"],
    ["Lost context", "Decisions live in chat history and disappear", "Specs, designs, ADRs and run reports are committed next to the code"],
  ]
  text(s, "Without a framework", 1.3, 1.45, 4.9, 0.4, { fontSize: 16, bold: true, color: C.accent4 })
  text(s, "With ADLC", 7.15, 1.45, 5.5, 0.4, { fontSize: 16, bold: true, color: C.accent3 })
  for (const [i, [topic, before, after]] of why.entries()) {
    const y = 1.95 + i * 1.22
    card(s, 0.6, y, 5.75, 1.05, { fill: C.accent4, transparency: 93, name: `before ${topic}` })
    await iconTile(s, "LuX", 0.8, y + 0.22, 0.6, "accent4", `before ${topic}`)
    text(s, [{ text: topic, options: { bold: true, breakLine: true } }, { text: before, options: { color: C.accent6 } }], 1.6, y + 0.13, 4.6, 0.85, { fontSize: 13 })
    card(s, 6.55, y, 6.15, 1.05, { fill: C.accent3, transparency: 92, name: `after ${topic}` })
    await iconTile(s, "LuCheck", 6.75, y + 0.22, 0.6, "accent3", `after ${topic}`)
    text(s, after, 7.55, y + 0.13, 5.0, 0.85, { fontSize: 14, valign: "middle" })
  }
  s.addNotes("The problem ADLC solves is not whether AI can write code; it can. It is making that repeatable, reviewable and safe. Each row is a failure mode we see with ad-hoc AI coding, and the ADLC answer.")

  // ── 4. Lifecycle ───────────────────────────────────────────────────────────
  s = content("The lifecycle: five commands from an idea to a running backlog", MAIN)
  const steps = [
    ["/init", "Project setup", "Repo, CI, registry, environments, secrets by name. One-time.", "LuSettings2", "accent6"],
    ["/discover", "Product", "Guided interview → vision, PRD with acceptance criteria, glossary.", "LuCompass", "accent5"],
    ["/architect", "Architecture", "System design, ADRs, quality attributes, fitness checks.", "LuLayers", "accent1"],
    ["/plan-backlog", "Backlog", "Milestones, epics, issues with dependencies; walking skeleton first.", "LuListTodo", "accent2"],
    ["/deliver", "Delivery", "Each issue → a reviewed PR. Unattended, in dependency order.", "LuRocket", "accent3"],
  ]
  for (const [i, [cmd, name, desc, ic, tone]] of steps.entries()) {
    const x = 0.6 + i * 2.5
    await iconTile(s, ic, x + 0.75, 1.65, 0.8, tone)
    if (i < steps.length - 1) s.addImage({ data: await icon("LuChevronRight", HEX.accent6), x: x + 2.15, y: 1.83, w: 0.42, h: 0.42, objectName: "flow arrow" })
    text(s, cmd, x, 2.6, 2.3, 0.4, { fontSize: 16, bold: true, color: C[tone], align: "center", fontFace: "Courier New" })
    text(s, name, x, 3.0, 2.3, 0.4, { fontSize: 18, bold: true, align: "center" })
    text(s, desc, x + 0.1, 3.45, 2.1, 1.3, { fontSize: 13, color: C.accent6, align: "center" })
  }
  card(s, 0.6, 5.05, 12.1, 1.55, { fill: C.background2, name: "interactive vs unattended" })
  await iconTile(s, "LuMessageSquare", 0.85, 5.35, 0.85, "accent5")
  text(s, [
    { text: "Interactive with you: ", options: { bold: true } },
    { text: "the first four run as conversations in the Claude app (Remote Control). You answer questions and approve each result as a pull request.", options: { breakLine: true } },
    { text: "Unattended: ", options: { bold: true } },
    { text: "/deliver runs by itself for every ready issue; you only review the pull requests that need you." },
  ], 1.95, 5.25, 10.5, 1.2, { fontSize: 14, valign: "middle" })
  s.addNotes("Five slash commands. The first four are conversations: you are in the loop, answering questions and approving the output, which always lands as a pull request. Delivery is the only unattended step, and it only starts once the backlog exists.")

  // ── 5. Roles ───────────────────────────────────────────────────────────────
  s = content("Humans steer, agents do the work", MAIN)
  card(s, 0.6, 1.45, 5.9, 5.2, { fill: C.accent2, transparency: 88, name: "humans" })
  await iconTile(s, "LuUser", 0.9, 1.75, 0.8, "accent2")
  text(s, "You (the owner)", 1.9, 1.85, 4.4, 0.6, { fontSize: 22, bold: true })
  text(s, [
    { text: "Describe the product and answer questions", options: { bullet: true, breakLine: true } },
    { text: "Approve architecture, setup and high-risk PRs", options: { bullet: true, breakLine: true } },
    { text: "Do owner tasks: accounts, credentials, legal, infrastructure", options: { bullet: true, breakLine: true } },
    { text: "Answer agents' questions on blocked issues", options: { bullet: true, breakLine: true } },
    { text: "Deploy to production and cut releases", options: { bullet: true, breakLine: true } },
    { text: "Pause, resume and prioritise the pipeline", options: { bullet: true } },
  ], 0.95, 2.85, 5.3, 3.6, { fontSize: 16, paraSpaceAfter: 8 })
  card(s, 6.8, 1.45, 5.9, 5.2, { fill: C.accent1, transparency: 90, name: "agents" })
  await iconTile(s, "LuBot", 7.1, 1.75, 0.8, "accent1")
  text(s, "The agents", 8.1, 1.85, 4.4, 0.6, { fontSize: 22, bold: true })
  text(s, [
    { text: "Turn ideas into PRDs, ADRs and a backlog", options: { bullet: true, breakLine: true } },
    { text: "Write specs, designs and failing tests first", options: { bullet: true, breakLine: true } },
    { text: "Implement in parallel, then verify and debug", options: { bullet: true, breakLine: true } },
    { text: "Review code and security, run end-to-end QA", options: { bullet: true, breakLine: true } },
    { text: "Open the PR with full traceability", options: { bullet: true, breakLine: true } },
    { text: "Deploy merged work to the dev environment", options: { bullet: true } },
  ], 7.15, 2.85, 5.3, 3.6, { fontSize: 16, paraSpaceAfter: 8 })
  s.addNotes("A clear split. You own decisions, approvals, anything needing your accounts or legal standing, and production. The agents own the engineering work up to a reviewed PR, and the dev environment. Owner tasks are real GitHub issues assigned to you, and the agents' work waits on them automatically.")

  // ── 6. Eight phases ────────────────────────────────────────────────────────
  s = content("One issue, eight phases, a specialist for each", MAIN)
  const phases = [
    ["Understand", "scout · requirements analyst", "Spec with testable acceptance criteria", "LuSearch"],
    ["Design", "feature architect", "Design, risk tier, small tasks", "LuDraftingCompass"],
    ["Tests first", "test designer", "Failing tests, one per criterion", "LuFlaskConical"],
    ["Build", "implementers (parallel)", "One task each, own git worktree", "LuHammer"],
    ["Verify", "build runner · debugger", "Lint, types, architecture, tests", "LuCheckCheck"],
    ["QA", "QA engineer", "End-to-end on web and Android", "LuSmartphone"],
    ["Review", "code + security reviewers", "Blocking findings get fixed", "LuEye"],
    ["PR", "release manager", "PR, labels, merge policy", "LuGitPullRequest"],
  ]
  for (const [i, [name, who, what, ic]] of phases.entries()) {
    const col = i % 4, row = Math.floor(i / 4)
    const x = 0.6 + col * 3.05, y = 1.5 + row * 2.6
    card(s, x, y, 2.85, 2.35, { name: `phase ${name}` })
    await iconTile(s, ic, x + 0.25, y + 0.25, 0.65, i === 7 ? "accent3" : "accent1")
    text(s, `${i + 1}`, x + 2.15, y + 0.25, 0.45, 0.5, { fontSize: 26, bold: true, color: C.accent1, align: "right", transparency: 40 })
    text(s, name, x + 0.25, y + 1.0, 2.4, 0.4, { fontSize: 17, bold: true })
    text(s, who, x + 0.25, y + 1.4, 2.4, 0.35, { fontSize: 12, italic: true, color: C.accent1 })
    text(s, what, x + 0.25, y + 1.75, 2.4, 0.55, { fontSize: 13, color: C.accent6 })
  }
  s.addNotes("This is what /deliver does for each issue. A lead agent orchestrates and never reads code itself; specialists do the work and hand over through files. Tests are written before the code and must fail for the right reason. Implementers run in parallel on independent tasks. Verify retries with a debugger; review can send work back. Every phase is committed and pushed, so a crashed run resumes where it stopped.")

  // ── 7. Guardrails ──────────────────────────────────────────────────────────
  s = content("Guardrails are built in, not bolted on", MAIN)
  const guards = [
    ["LuBox", "Sandboxed runner", "Each project runs in its own container with its own Docker engine. Internet access goes through an allowlist proxy."],
    ["LuBadgeCheck", "Its own GitHub identity", "Agents act as a GitHub App bot with 1-hour tokens for one repo. No admin rights, no access to your account."],
    ["LuGitBranch", "Branch protection", "Required CI checks, linear history. CI, deploy and build files need the owner's review (CODEOWNERS)."],
    ["LuGauge", "Risk tiers", "Every change gets a risk tier. Only low risk may auto-merge; the rest waits for you."],
    ["LuFlaskConical", "Tests and reviews", "Tests first, every acceptance criterion mapped to a test, AI code and security review."],
    ["LuLock", "Production stays human", "No CI runner on prod. The owner deploys reviewed commits from main with one command."],
  ]
  for (const [i, [ic, t, d]] of guards.entries()) {
    const col = i % 3, row = Math.floor(i / 3)
    const x = 0.6 + col * 4.1, y = 1.5 + row * 2.6
    card(s, x, y, 3.9, 2.35, { name: `guard ${t}` })
    await iconTile(s, ic, x + 0.3, y + 0.3, 0.7, "accent3")
    text(s, t, x + 1.2, y + 0.38, 2.55, 0.6, { fontSize: 17, bold: true, valign: "middle" })
    text(s, d, x + 0.3, y + 1.15, 3.35, 1.1, { fontSize: 13, color: C.accent6 })
  }
  s.addNotes("Six guardrails. The important idea: safety comes from structure, not from trusting the model. Agents simply don't have the credentials or network paths to do damage beyond the project sandbox, and anything that changes CI, deployment or the build needs a human approval enforced by GitHub itself.")

  // ── 8. Where it runs ───────────────────────────────────────────────────────
  s = content("Where it runs: one dev server, GitHub and Claude", MAIN)
  card(s, 0.6, 1.45, 8.3, 5.2, { fill: C.background2, name: "dev server" })
  text(s, "Dev server (Docker)", 0.85, 1.6, 5, 0.4, { fontSize: 15, bold: true, color: C.accent1 })
  const boxes = [
    [0.85, 2.15, "Runner (per project)", "Claude Code, poller, Remote Control, dev deployer", "LuBot"],
    [4.95, 2.15, "Docker sidecar", "Per-run test environments and preview URLs", "LuContainer"],
    [0.85, 3.65, "Egress proxy", "Internet allowlist and audit log", "LuShieldCheck"],
    [4.95, 3.65, "CI runner", "One-job runners in a separate engine", "LuWorkflow"],
    [0.85, 5.15, "Edge proxy", "Routes previews and the dashboard", "LuNetwork"],
    [4.95, 5.15, "Dashboard", "Read-only view, pause / resume", "LuLayoutDashboard"],
  ]
  for (const [x, y, t, d, ic] of boxes) {
    card(s, x, y, 3.8, 1.3, { fill: C.background1, name: `box ${t}` })
    await iconTile(s, ic, x + 0.2, y + 0.3, 0.7, "accent1")
    text(s, [{ text: t, options: { bold: true, breakLine: true } }, { text: d, options: { color: C.accent6, fontSize: 12 } }], x + 1.05, y + 0.18, 2.6, 0.95, { fontSize: 14, valign: "middle" })
  }
  const ext = [
    [1.45, "GitHub", "Issues, PRs, CI, the backlog board", "LuGithub", "accent1"],
    [2.8, "Claude (subscription)", "Agents; you via the Claude app", "LuSparkles", "accent5"],
    [4.15, "Container registry", "Images published from main", "LuPackage", "accent6"],
    [5.5, "Production (Swarm)", "Deployed by the owner only", "LuServer", "accent2"],
  ]
  for (const [y, t, d, ic, tone] of ext) {
    card(s, 9.2, y, 3.5, 1.15, { line: C.background2, fill: C.background1, name: `ext ${t}` })
    await iconTile(s, ic, 9.4, y + 0.22, 0.7, tone)
    text(s, [{ text: t, options: { bold: true, breakLine: true } }, { text: d, options: { color: C.accent6, fontSize: 12 } }], 10.25, y + 0.15, 2.35, 0.85, { fontSize: 14, valign: "middle" })
  }
  s.addNotes("Everything runs on one dev server with Docker. Each project gets a runner container with Claude Code and the poller that picks up ready issues, a Docker sidecar for test environments, and an egress proxy. CI jobs run in a separate engine the agents can't reach. Outside: GitHub holds the work, Claude provides the models through the subscription, the registry holds images, and production is a separate Swarm cluster that only the owner deploys to.")

  // ── 9. Stack packs ─────────────────────────────────────────────────────────
  s = content("Stack packs: technology know-how as plugins", MAIN)
  text(s, "The core is technology-agnostic. A stack pack adds conventions, templates, test environments and review checklists for one technology. Projects enable the packs they use.", 0.6, 1.4, 12.1, 0.8, { fontSize: 16, color: C.text2 })
  const packs = [
    ["React Native", "LuSmartphone", "Expo apps for iOS, Android and web; Android emulator; Playwright and Maestro end-to-end tests"],
    ["React web", "LuGlobe", "Vite + React SPAs with shadcn/ui and Tailwind; nginx image; Vitest, Playwright and accessibility checks"],
    ["Node API", "LuServerCog", "Fastify, zod and OpenAPI; Postgres and Redis; migrations; containers and Swarm stacks"],
    ["Your stack next", "LuPlus", "ESP32, Python, Go…: a pack is a folder of skills and templates; the core stays unchanged"],
  ]
  for (const [i, [t, ic, d]] of packs.entries()) {
    const x = 0.6 + i * 3.05
    const last = i === packs.length - 1
    card(s, x, 2.45, 2.85, 3.9, { fill: last ? C.background1 : C.background2, line: last ? C.accent1 : undefined, name: `pack ${t}` })
    await iconTile(s, ic, x + 0.3, 2.75, 0.8, last ? "accent2" : "accent1")
    text(s, t, x + 0.3, 3.75, 2.3, 0.45, { fontSize: 18, bold: true })
    text(s, d, x + 0.3, 4.25, 2.3, 1.9, { fontSize: 13, color: C.accent6 })
  }
  s.addNotes("Stack packs keep the core generic. Each pack is a Claude Code plugin with skills: conventions, templates for Dockerfiles and compose files, test environment recipes and review checklists. Agents load the packs of the stacks a project enables. Adding a new technology means writing a pack, not changing the pipeline.")

  // ── 10. Operating it ───────────────────────────────────────────────────────
  s = content("Operating it day to day", MAIN)
  const ops = [
    ["LuGithub", "GitHub", "The source of truth. Issues move through labels (queued → ready → in progress → PR open); you review PRs and answer questions on issues."],
    ["LuLayoutDashboard", "Dashboard", "What's running with its live log, the queue, what needs you, history and health. Pause and resume. Works on a phone."],
    ["LuSmartphone", "Claude app", "Interactive sessions on the dev server via Remote Control: discovery, architecture, planning, or working on an issue with Claude."],
    ["LuTerminal", "adlc CLI", "Set-up and operations on the dev server: up, status, logs, pause / resume, restart, ui."],
  ]
  for (const [i, [ic, t, d]] of ops.entries()) {
    const y = 1.5 + i * 1.3
    await iconTile(s, ic, 0.6, y, 0.95, "accent1")
    text(s, t, 1.8, y + 0.02, 3, 0.45, { fontSize: 19, bold: true })
    text(s, d, 1.8, y + 0.45, 10.8, 0.6, { fontSize: 14, color: C.accent6 })
  }
  s.addNotes("Four touch points. GitHub is where the work lives; the labels are the state machine. The dashboard is the window into the runner. The Claude app gives you interactive sessions on the dev server. The CLI is for setup and the occasional operational task.")

  // ── 11. Dashboard ──────────────────────────────────────────────────────────
  s = content("The dashboard: see the pipeline at a glance", MAIN)
  s.addImage({ path: SHOT, x: 0.6, y: 1.4, w: 8.4, h: 8.4 * 1720 / 2720, objectName: "dashboard screenshot" })
  const callouts = [
    ["LuRadio", "Live run", "Phase stepper and the agents' narrative as it happens"],
    ["LuInbox", "Needs you", "PRs to review, blocked runs, your next tasks"],
    ["LuShieldCheck", "Safe by design", "Reads files only; no credentials, no Docker socket"],
  ]
  for (const [i, [ic, t, d]] of callouts.entries()) {
    const y = 1.5 + i * 1.65
    await iconTile(s, ic, 9.35, y, 0.7, "accent1")
    text(s, t, 10.2, y, 2.5, 0.4, { fontSize: 16, bold: true })
    text(s, d, 10.2, y + 0.4, 2.5, 1.0, { fontSize: 13, color: C.accent6 })
  }
  s.addNotes("The dashboard runs next to the runners on the dev server. It shows every project, the active run with its live log and phase, the queue in the order work will happen, what needs your attention, history and component health. It only reads files and asks the runner to pause or resume, so compromising it gives nothing away.")

  // ── 12. Case study ─────────────────────────────────────────────────────────
  s = content("Example: orbit, a multi-tenant booking platform", MAIN)
  text(s, [{ text: "Booking web app for businesses, iOS and Android app for their customers, Node API and Postgres, payments, EU data. " }, { text: "Illustrative example; figures are representative of a first ADLC project.", options: { italic: true, color: C.accent6 } }], 0.6, 1.4, 12.1, 0.6, { fontSize: 16, color: C.text2 })
  const dstats = [["14", "ADRs", "architecture decisions, reviewed by an independent agent"], ["62", "issues", "45 for agents, 9 owner tasks, 8 epics in 4 milestones"], ["~25 min", "issue → PR", "a walking-skeleton issue with 20+ acceptance criteria"], ["1", "owner", "approving PRs and doing owner tasks"]]
  for (const [i, [big, label, desc]] of dstats.entries()) {
    const x = 0.6 + i * 3.05
    text(s, big, x, 2.2, 2.85, 0.9, { fontSize: 44, bold: true, color: C.accent1 })
    text(s, label, x, 3.1, 2.85, 0.4, { fontSize: 16, bold: true })
    text(s, desc, x, 3.5, 2.7, 0.8, { fontSize: 13, color: C.accent6 })
  }
  const timeline = [["Setup", "repo, CI, registry, identity"], ["Discovery", "PRD, journeys, ACs"], ["Architecture", "14 ADRs, review debate"], ["Backlog", "62 issues with dependencies"], ["Delivery", "walking skeleton running"]]
  s.addShape(pres.shapes.LINE, { x: 0.9, y: 5.25, w: 9.8, h: 0, line: { color: C.accent1, width: 2, transparency: 50 }, objectName: "timeline" })
  for (const [i, [t, d]] of timeline.entries()) {
    const x = 0.6 + i * 2.45
    s.addShape(pres.shapes.OVAL, { x: x + 0.15, y: 5.1, w: 0.3, h: 0.3, fill: { color: i === 4 ? C.accent3 : C.accent1 }, line: { color: C.background1, width: 2 }, objectName: `milestone ${t}` })
    text(s, t, x, 5.55, 2.3, 0.4, { fontSize: 15, bold: true })
    text(s, d, x, 5.95, 2.3, 0.6, { fontSize: 13, color: C.accent6 })
  }
  s.addNotes("orbit is an illustrative example of a first ADLC project, with representative figures. Discovery and architecture take a few interactive sessions; the backlog planner turns the PRD and architecture into issues with native GitHub dependencies, a walking skeleton first and owner tasks for everything only a person can do. A walking-skeleton issue with 20+ acceptance criteria goes from issue to pull request in about 25 minutes of agent time.")

  // ── 13. Lessons ────────────────────────────────────────────────────────────
  s = content("What the first real runs taught us, and what we fixed", MAIN)
  const lessons = [
    ["Required checks without CI blocked every PR", "CI is bootstrapped at setup; jobs switch on one by one as their commands work"],
    ["A background subagent was cut off after 10 idle minutes", "Unattended runs keep every subagent in the foreground"],
    ["The poller didn't trust the bot-written backlog", "ADLC's own identity is trusted; your adlc:ready approves outsiders"],
    ["An agent pre-filled the owner as approver", "Agents never record a human's approval; it shows as 'owner decision needed'"],
    ["A prod CI runner was planned on the Swarm manager", "Production is deployed by the owner only, with adlc-swarm-deploy"],
  ]
  for (const [i, [found, fix]] of lessons.entries()) {
    const y = 1.5 + i * 1.04
    card(s, 0.6, y, 12.1, 0.88, { name: `lesson ${i + 1}` })
    await iconTile(s, "LuLightbulb", 0.8, y + 0.14, 0.6, "accent2", `lesson ${i + 1}`)
    text(s, found, 1.6, y + 0.1, 4.9, 0.7, { fontSize: 14, bold: true, valign: "middle" })
    s.addImage({ data: await icon("LuArrowRight", HEX.accent6), x: 6.55, y: y + 0.27, w: 0.34, h: 0.34, objectName: `lesson ${i + 1} arrow` })
    text(s, fix, 7.05, y + 0.1, 5.5, 0.7, { fontSize: 14, color: C.accent3, valign: "middle" })
  }
  s.addNotes("Running a real project found real gaps, each now fixed in the framework so the next project doesn't hit them. The theme: when something goes wrong, the framework fails safe; nothing was merged or deployed that shouldn't have been.")

  // ── 14. Getting started ────────────────────────────────────────────────────
  s = content("Getting started: from zero to the first delivery run", MAIN)
  const start = [
    ["Prepare the dev server", "Docker, the ADLC repo, adlc doctor", "LuServer"],
    ["Create the GitHub App", "Once per GitHub account; reused by every project", "LuBadgeCheck"],
    ["Start the project", "adlc secrets, adlc up, adlc login", "LuPlay"],
    ["Set it up with Claude", "/init → /discover → /architect → /plan-backlog", "LuMessageSquare"],
    ["Let it deliver", "Close the first owner tasks; review the PRs as they arrive", "LuRocket"],
  ]
  for (const [i, [t, d, ic]] of start.entries()) {
    const y = 1.5 + i * 1.04
    s.addShape(pres.shapes.OVAL, { x: 0.6, y: y + 0.1, w: 0.65, h: 0.65, fill: { color: C.accent1 }, line: { type: "none" }, objectName: `step ${i + 1}` })
    text(s, `${i + 1}`, 0.6, y + 0.1, 0.65, 0.65, { fontSize: 20, bold: true, color: C.background1, align: "center", valign: "middle" })
    text(s, t, 1.5, y + 0.05, 4.3, 0.4, { fontSize: 18, bold: true })
    text(s, d, 1.5, y + 0.45, 6.0, 0.45, { fontSize: 14, color: C.accent6 })
  }
  card(s, 8.1, 1.5, 4.6, 5.0, { name: "time box" })
  await iconTile(s, "LuClock", 8.4, 1.8, 0.75, "accent5")
  text(s, "Typical effort", 9.35, 1.88, 3.2, 0.6, { fontSize: 18, bold: true, valign: "middle" })
  text(s, [
    { text: "Dev server and app: about an hour", options: { bullet: true, breakLine: true } },
    { text: "Setup and discovery: a few sessions", options: { bullet: true, breakLine: true } },
    { text: "Architecture and backlog: a few more", options: { bullet: true, breakLine: true } },
    { text: "Then: reviewing PRs and owner tasks", options: { bullet: true } },
  ], 8.45, 2.85, 4.0, 3.4, { fontSize: 15, paraSpaceAfter: 10 })
  s.addNotes("Five steps. The README in the ADLC repo walks through each with exact commands. Most of the elapsed time goes into the conversations about the product and the architecture, which is where your judgement matters most.")

  // ── 15. Requirements ───────────────────────────────────────────────────────
  s = content("What you need", MAIN)
  const reqs = [
    ["LuServer", "A dev server", "Linux with Docker; 8+ cores, 32 GB RAM and 100 GB disk recommended. /dev/kvm for the Android emulator."],
    ["LuSparkles", "A Claude subscription", "Claude Max: unattended runs and Remote Control use the subscription, not per-token billing."],
    ["LuGithub", "GitHub Pro or Team", "Branch protection, CODEOWNERS and environments on private repos. One GitHub App per account."],
    ["LuPackage", "A container registry", "Harbor or GHCR for the images CI publishes."],
  ]
  for (const [i, [ic, t, d]] of reqs.entries()) {
    const col = i % 2, row = Math.floor(i / 2)
    const x = 0.6 + col * 6.15, y = 1.5 + row * 2.6
    card(s, x, y, 5.95, 2.35, { name: `req ${t}` })
    await iconTile(s, ic, x + 0.3, y + 0.3, 0.8, "accent1")
    text(s, t, x + 1.35, y + 0.35, 4.4, 0.6, { fontSize: 19, bold: true, valign: "middle" })
    text(s, d, x + 0.3, y + 1.25, 5.4, 0.95, { fontSize: 14, color: C.accent6 })
  }
  s.addNotes("The prerequisites. The subscription matters: unattended runs use a long-lived subscription token rather than API billing, and the runner backs off automatically when the usage limit is reached. Costs shown in the dashboard are API-equivalent, for comparison only.")

  // ── 16. Limits ─────────────────────────────────────────────────────────────
  s = content("Honest limits today", MAIN)
  const limits = [
    ["One run at a time per project", "Parallel implementers inside a run, but issues are delivered one after another (configurable)."],
    ["Your review is the bottleneck", "With a cautious merge policy most PRs wait for you; loosen it as trust grows."],
    ["iOS end-to-end tests need a Mac", "Written by the agents, run on the owner's Mac before a release."],
    ["Subscription usage limits", "Long runs can hit the usage window; the runner pauses and resumes by itself."],
    ["Young framework", "Proven on one project so far; expect rough edges and keep the fixes flowing back."],
  ]
  for (const [i, [t, d]] of limits.entries()) {
    const y = 1.5 + i * 1.04
    await iconTile(s, "LuTriangleAlert", 0.6, y + 0.08, 0.7, "accent2", `limit ${i + 1}`)
    text(s, t, 1.55, y + 0.05, 11.1, 0.4, { fontSize: 17, bold: true })
    text(s, d, 1.55, y + 0.45, 11.1, 0.45, { fontSize: 14, color: C.accent6 })
  }
  s.addNotes("Be upfront about the limits. The biggest practical one is review capacity: the framework produces PRs faster than one person reviews them carefully, so start with a cautious merge policy and relax it for low-risk work as you build trust.")

  // ── 17. Next steps ─────────────────────────────────────────────────────────
  s = pres.addSlide({ masterName: "SECTION", sectionTitle: MAIN })
  s.addText("Next steps", { placeholder: "title" })
  s.addText([
    { text: "Pick a pilot project and a dev server", options: { bullet: true, breakLine: true } },
    { text: "Read the README in the ADLC repo, then run adlc doctor", options: { bullet: true, breakLine: true } },
    { text: "Share what you find: issues and stack packs are welcome", options: { bullet: true } },
  ], { placeholder: "body" })
  s.addNotes("Close with a concrete ask: one pilot project per team that is interested, and feedback into the framework.")

  // ── Appendix ───────────────────────────────────────────────────────────────
  pres.addSection({ title: APP })
  s = pres.addSlide({ masterName: "SECTION", sectionTitle: APP })
  s.addText("Appendix", { placeholder: "title" })
  s.addText("Reference: agents, commands, labels, risk, files, CI, security, production, CLI, dashboard", { placeholder: "body" })
  s.addNotes("Reference material for adopters. Each slide stands on its own.")

  // A1 agents
  s = content("A1 · The agents and their model routing", APP)
  const agents = [
    ["requirements-analyst", "Opus · high", "Spec with testable acceptance criteria"],
    ["feature-architect", "Opus · high", "Design, risk tier, tasks"],
    ["backlog-planner", "Opus · high", "Epics, issues, dependencies"],
    ["architecture-reviewer", "Opus · xhigh", "Independent architecture review"],
    ["product-advisor", "Opus · medium", "Product suggestions in discovery"],
    ["implementer", "Sonnet · medium", "One task in its own worktree"],
    ["test-designer", "Sonnet · medium", "Failing acceptance tests first"],
    ["code-reviewer", "Sonnet · high", "Correctness, spec, design gate"],
    ["debugger", "Sonnet · high", "Fixes failing verification"],
    ["security-reviewer", "Sonnet · medium", "Security review of the diff"],
    ["qa-engineer", "Sonnet · medium", "End-to-end and exploratory QA"],
    ["researcher", "Sonnet · medium", "Facts with sources"],
    ["codebase-scout", "Haiku · low", "Maps the relevant code"],
    ["build-runner", "Haiku · low", "Runs lint, types, tests"],
    ["release-manager", "Haiku · low", "PR, labels, merge policy"],
  ]
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text1 } } })
  const half = (rows) => [[hdr("Agent"), hdr("Model · effort"), hdr("Job")], ...rows.map(([a, m, j]) => [{ text: a, options: { fontFace: "Courier New", fontSize: 11 } }, m, j])]
  s.addTable(half(agents.slice(0, 8)), { x: 0.6, y: 1.45, w: 6.0, colW: [2.0, 1.45, 2.55], fontSize: 11, color: C.text1, border: { type: "solid", pt: 0.5, color: "D8DBF5" }, rowH: 0.42, valign: "middle" })
  s.addTable(half(agents.slice(8)), { x: 6.75, y: 1.45, w: 5.95, colW: [2.0, 1.45, 2.5], fontSize: 11, color: C.text1, border: { type: "solid", pt: 0.5, color: "D8DBF5" }, rowH: 0.42, valign: "middle" })
  text(s, "The delivery lead runs on Sonnet. Judgement-heavy work goes to Opus, routine execution to Haiku: quality where it counts, quota saved elsewhere.", 6.75, 5.0, 5.95, 1.2, { fontSize: 13, color: C.accent6 })
  s.addNotes("Fifteen agents. The routing is deliberate: specification, design and planning decide everything downstream, so they get the strongest model. Mechanical work such as running the build or opening the PR gets the fastest.")

  // A2 commands
  s = content("A2 · Commands, outputs and who merges", APP)
  const cmds = [
    [hdr("Command"), hdr("Mode"), hdr("Produces"), hdr("Merge")],
    ["/adlc-core:init", "interactive", "adlc.yaml, setup.md, CLAUDE.md block, provision.sh, CI bootstrap", "you (setup PR)"],
    ["/adlc-core:discover", "interactive", "docs/product: vision, PRD with ACs, glossary", "auto (docs)"],
    ["/adlc-core:architect", "interactive", "docs/architecture: architecture.md, ADRs, fitness, evolution; adlc.build.yaml", "you"],
    ["/adlc-core:plan-backlog", "interactive", "milestones, epics, issues with dependencies; .adlc/backlog.md", "you approve the plan"],
    ["/adlc-core:deliver <n>", "unattended", "spec, design, tests, code, reports → PR", "by risk tier"],
  ].map((r, i) => (i === 0 ? r : r.map((c, j) => (j === 0 ? { text: c, options: { fontFace: "Courier New", fontSize: 12 } } : c))))
  s.addTable(cmds, { x: 0.6, y: 1.5, w: 12.1, colW: [2.9, 1.5, 5.6, 2.1], fontSize: 13, color: C.text1, border: { type: "solid", pt: 0.5, color: "D8DBF5" }, rowH: 0.6, valign: "middle" })
  text(s, "--resume continues an interrupted interactive phase. --update (init) changes one setup section. --debate (architect) adds a reviewer debate before the verdict.", 0.6, 5.5, 12.1, 0.8, { fontSize: 14, color: C.accent6 })
  s.addNotes("The five commands with what each produces and who merges the result. Only delivery runs unattended.")

  // A3 labels
  s = content("A3 · Issue states are GitHub labels", APP)
  const flow = [["queued", "waiting on blockers", "accent6"], ["ready", "can start", "accent3"], ["in-progress", "a run is working", "accent1"], ["pr-open", "PR waiting for merge", "accent5"]]
  for (const [i, [l, d, tone]] of flow.entries()) {
    const x = 0.6 + i * 2.75
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.7, w: 2.3, h: 1.05, rectRadius: 0.15, fill: { color: C[tone] }, line: { type: "none" }, objectName: `state ${l}` })
    text(s, [{ text: `adlc:${l}`, options: { bold: true, breakLine: true } }, { text: d, options: { fontSize: 12 } }], x, 1.7, 2.3, 1.05, { fontSize: 15, color: C.background1, align: "center", valign: "middle" })
    s.addImage({ data: await icon("LuArrowRight", HEX.accent6), x: x + 2.36, y: 2.03, w: 0.36, h: 0.36, objectName: "state arrow" })
  }
  text(s, [{ text: "merged,", options: { breakLine: true } }, { text: "issue closed" }], 11.65, 1.7, 1.1, 1.05, { fontSize: 14, color: C.accent3, bold: true, valign: "middle" })
  const side = [
    ["adlc:needs-info", "The run has a question (comment on the issue). Answer it, relabel ready.", "accent2"],
    ["adlc:blocked", "The run stopped (summary comment). Fix the cause, relabel ready.", "accent4"],
    ["adlc:needs-human-review", "Issue from a non-collaborator. Add adlc:ready to approve it.", "accent2"],
    ["adlc:owner", "Your task. Agents never run it; closing it unblocks the work behind it.", "accent2"],
    ["adlc:risk-low · medium · high", "Risk tier of the change; decides who merges.", "accent6"],
  ]
  for (const [i, [l, d, tone]] of side.entries()) {
    const y = 3.2 + i * 0.68
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y, w: 3.6, h: 0.5, rectRadius: 0.1, fill: { color: C[tone], transparency: 82 }, line: { type: "none" }, objectName: `label ${l}` })
    text(s, l, 0.75, y, 3.4, 0.5, { fontSize: 13, bold: true, valign: "middle", fontFace: "Courier New" })
    text(s, d, 4.45, y, 8.2, 0.5, { fontSize: 14, color: C.text1, valign: "middle" })
  }
  s.addNotes("Labels are the state machine; the poller moves issues along it. The poller promotes queued to ready when all GitHub blocked-by issues are closed, picks ready issues by milestone due date then age, and only trusts issues from collaborators, from ADLC itself, or approved by a collaborator.")

  // A4 risk
  s = content("A4 · Risk tiers decide who merges", APP)
  const risk = [
    ["Low", "accent3", "Small, contained changes with tests; no new dependencies; no CI, deploy or schema changes", "Auto-merge after green CI and approving AI reviews, if the project allows it"],
    ["Medium", "accent2", "Feature work across layers, additive schema changes, new endpoints", "Policy per project (adlc.yaml autonomy.auto_merge); a cautious start: you merge"],
    ["High", "accent4", "CI or workflows, deployment, auth, data migrations, new dependencies, ADR deviations", "Always you. Changes to /.github, /deploy and adlc.build.yaml also need your code-owner review"],
  ]
  for (const [i, [t, tone, what, who]] of risk.entries()) {
    const y = 1.5 + i * 1.7
    card(s, 0.6, y, 12.1, 1.5, { fill: C[tone], transparency: 90, name: `risk ${t}` })
    text(s, t, 0.9, y, 1.8, 1.5, { fontSize: 24, bold: true, color: C[tone], valign: "middle" })
    text(s, [{ text: "What lands here", options: { bold: true, breakLine: true } }, { text: what }], 2.8, y + 0.2, 4.9, 1.1, { fontSize: 13 })
    text(s, [{ text: "Who merges", options: { bold: true, breakLine: true } }, { text: who }], 7.9, y + 0.2, 4.6, 1.1, { fontSize: 13 })
  }
  s.addNotes("The feature architect assigns the tier with a rubric and errs upwards. The merge policy lives in adlc.yaml, which unattended agents cannot edit, so they can never raise their own autonomy.")

  // A5 files
  s = content("A5 · What ADLC adds to a project repository", APP)
  const files = [
    ["adlc.yaml", "Policy and setup values: stacks, environments, identity, autonomy, network. Read-only for unattended agents."],
    ["adlc.build.yaml", "Build profile: install, lint, typecheck, arch_check, test commands; test environment lifecycle; e2e targets; CI switch-on (status, ci.active)."],
    ["CLAUDE.md", "Short project context loaded by every agent, with a generated setup block."],
    ["docs/product · docs/architecture", "PRD, glossary, architecture, ADRs, fitness checks: the binding decisions."],
    [".adlc/runs/<n>/", "Per run: issue, spec, design, tasks, tests.md (AC → test), verify and review reports."],
    [".github/ · deploy/", "CI workflows with the gate, compose files for dev and test, Swarm stack files for prod."],
  ]
  for (const [i, [f, d]] of files.entries()) {
    const y = 1.5 + i * 0.86
    card(s, 0.6, y, 12.1, 0.72, { name: `file ${f}` })
    text(s, f, 0.85, y, 3.6, 0.72, { fontSize: 14, bold: true, fontFace: "Courier New", valign: "middle", color: C.accent1 })
    text(s, d, 4.55, y, 8.0, 0.72, { fontSize: 13, valign: "middle" })
  }
  s.addNotes("Everything ADLC needs is in the repository, versioned with the code. A new person, or a new agent session, can understand any decision from these files.")

  // A6 CI
  s = content("A6 · CI: required checks from the first PR", APP)
  const ci = [
    ["LuListChecks", "Six required checks", "lint, typecheck, arch-check, test, e2e-web, e2e-android. Job names never change."],
    ["LuToggleRight", "A gate in every job", "Skips with success until the job is switched on (ci.active, then status: active), and on docs-only changes. Fails closed."],
    ["LuServer", "Self-hosted, one job each", "Just-in-time runners in a separate Docker engine, wiped between jobs; GitHub-hosted runners as a fallback."],
    ["LuPackage", "Publish from main only", "Images are built and pushed with credentials that exist only in the publish environment."],
  ]
  for (const [i, [ic, t, d]] of ci.entries()) {
    const col = i % 2, row = Math.floor(i / 2)
    const x = 0.6 + col * 6.15, y = 1.5 + row * 2.6
    card(s, x, y, 5.95, 2.35, { name: `ci ${t}` })
    await iconTile(s, ic, x + 0.3, y + 0.3, 0.75, "accent1")
    text(s, t, x + 1.3, y + 0.35, 4.5, 0.6, { fontSize: 18, bold: true, valign: "middle" })
    text(s, d, x + 0.3, y + 1.2, 5.4, 1.0, { fontSize: 14, color: C.accent6 })
  }
  s.addNotes("CI exists from the setup PR, so required checks always report. Until the walking skeleton proves each command, the jobs skip with success; the skeleton switches them on one by one. CI jobs run on the dev server in an engine the agents cannot reach, one job per throwaway runner.")

  // A7 security
  s = content("A7 · Security model: threats and controls", APP)
  const sec = [
    [hdr("Threat"), hdr("Control")],
    ["Agent-written code misbehaves on the host", "Per-project container and Docker engine; egress allowlist proxy; no host mounts beyond the project"],
    ["Agents act with the owner's rights", "GitHub App bot, 1-hour single-repo tokens, no admin; checked before every run"],
    ["Agents change CI, deploy or their own autonomy", "CODEOWNERS on /.github, /deploy, adlc.build.yaml; adlc.yaml read-only in unattended runs"],
    ["Secrets leak", "Never in the repo or chat; prompted, stored mode 600; publish credentials only in the main-only environment"],
    ["A PR workflow reaches production", "No runner on the Swarm manager; owner-run deploys of commits on main only"],
    ["Strangers' issues drive the agents", "Only collaborators, ADLC itself, or a collaborator's adlc:ready start work"],
    ["Release tags created by agents", "Tag ruleset: v* tags for repository admins only"],
  ]
  s.addTable(sec, { x: 0.6, y: 1.45, w: 12.1, colW: [4.3, 7.8], fontSize: 13, color: C.text1, border: { type: "solid", pt: 0.5, color: "D8DBF5" }, rowH: 0.62, valign: "middle" })
  s.addNotes("Each threat maps to a structural control enforced by Docker, GitHub or the runner, rather than by instructions to the model.")

  // A8 prod
  s = content("A8 · Production: deployed by a person, from main only", APP)
  const prod = [
    ["Merge to main", "Reviewed PRs only", "LuGitMerge"],
    ["CI publishes", "Images tagged sha-<7>", "LuPackage"],
    ["Owner runs", "adlc-swarm-deploy <repo> <ref>", "LuTerminal"],
    ["Checks", "Commit on main; every image exists", "LuListChecks"],
    ["Pre-deploy", "Migrations as a one-off job", "LuDatabase"],
    ["Rolling update", "Start-first, automatic rollback", "LuRefreshCw"],
  ]
  for (const [i, [t, d, ic]] of prod.entries()) {
    const x = 0.6 + i * 2.05
    await iconTile(s, ic, x + 0.55, 1.75, 0.8, i === 2 ? "accent2" : "accent1")
    if (i < prod.length - 1) s.addImage({ data: await icon("LuChevronRight", HEX.accent6), x: x + 1.72, y: 1.95, w: 0.38, h: 0.38, objectName: "deploy arrow" })
    text(s, t, x, 2.75, 1.9, 0.4, { fontSize: 15, bold: true, align: "center" })
    text(s, d, x + 0.05, 3.15, 1.8, 0.8, { fontSize: 12, color: C.accent6, align: "center" })
  }
  card(s, 0.6, 4.4, 12.1, 2.0, { fill: C.accent2, transparency: 90, name: "why human" })
  await iconTile(s, "LuShieldAlert", 0.9, 4.75, 0.85, "accent2")
  text(s, [
    { text: "Why no deploy workflow? ", options: { bold: true } },
    { text: "A self-hosted runner registered to a repository also runs pull-request workflows from any branch. One agent-written workflow could reach the production manager. The deploy script runs nothing from CI and accepts only commits that went through branch protection. Several stacks (e.g. data and app) deploy separately; rollback is deploying the previous release." },
  ], 2.0, 4.55, 10.5, 1.7, { fontSize: 14, valign: "middle" })
  s.addNotes("Production deployment is the one step that stays fully manual by design. The script is idempotent, records a deployment history and makes rollback a single command.")

  // A9 CLI
  s = content("A9 · adlc command line (on the dev server)", APP)
  const cli = [
    ["adlc doctor", "check the host"], ["adlc secrets <slug>", "store credentials (prompted)"], ["adlc up <slug>", "build and start or update"], ["adlc app <slug> --id --key", "use the GitHub App"],
    ["adlc login <slug>", "one-time Claude login"], ["adlc session <slug>", "interactive session"], ["adlc status <slug> [--all]", "state and the queue"], ["adlc pause | resume <slug>", "stop or start new runs"],
    ["adlc logs <slug> <what>", "poller, run <n>, ci, …"], ["adlc restart <slug>", "reload plugins"], ["adlc audit <slug>", "egress domains seen"], ["adlc ui up | token", "the dashboard"],
  ]
  for (const [i, [c, d]] of cli.entries()) {
    const col = i % 2, row = Math.floor(i / 2)
    const x = 0.6 + col * 6.15, y = 1.5 + row * 0.85
    card(s, x, y, 5.95, 0.7, { name: `cli ${c}` })
    text(s, c, x + 0.25, y, 3.4, 0.7, { fontSize: 13, bold: true, fontFace: "Courier New", valign: "middle", color: C.accent1 })
    text(s, d, x + 3.7, y, 2.15, 0.7, { fontSize: 13, valign: "middle" })
  }
  s.addNotes("The CLI covers setup and operations. Day to day most people only use status, logs and the dashboard.")

  // A10 dashboard internals
  s = content("A10 · How the dashboard stays safe", APP)
  const nodes = [
    [0.6, "Browser", "Token login, HttpOnly SameSite cookie, CSRF header", "LuMonitor", "accent1"],
    [4.55, "Dashboard server", "Read-only mounts; no Docker socket, no tokens; internal network only", "LuLayoutDashboard", "accent1"],
    [8.5, "Runner (poller)", "Writes logs, state and a GitHub snapshot; applies requests within seconds", "LuBot", "accent3"],
  ]
  for (const [i, [x, t, d, ic, tone]] of nodes.entries()) {
    card(s, x, 1.6, 3.6, 2.6, { name: `node ${t}` })
    await iconTile(s, ic, x + 0.3, 1.9, 0.8, tone)
    text(s, t, x + 0.3, 2.85, 3.0, 0.45, { fontSize: 18, bold: true })
    text(s, d, x + 0.3, 3.3, 3.0, 0.85, { fontSize: 13, color: C.accent6 })
    if (i < nodes.length - 1) s.addImage({ data: await icon("LuArrowLeftRight", HEX.accent6), x: x + 3.67, y: 2.7, w: 0.3, h: 0.3, objectName: "link arrow" })
  }
  text(s, "HTTP + live streams", 4.0, 4.3, 3.0, 0.4, { fontSize: 12, color: C.accent6 })
  text(s, "shared files only", 8.0, 4.3, 3.0, 0.4, { fontSize: 12, color: C.accent6 })
  card(s, 0.6, 4.95, 12.1, 1.5, { fill: C.background2, name: "file contract" })
  text(s, [
    { text: "The contract is files: ", options: { bold: true } },
    { text: "the dashboard reads run logs, state and the snapshot; pause and resume are request files the poller applies, logs and deletes. Anything else is ignored. If the dashboard were compromised, an attacker could read logs and ask for a pause, nothing more." },
  ], 0.9, 5.1, 11.5, 1.2, { fontSize: 14, valign: "middle" })
  s.addNotes("The dashboard is deliberately unprivileged. It is useful because it can see everything, and safe because it cannot change anything except asking for a pause or resume.")

  await pres.writeFile({ fileName: OUT })
  await applyTheme(OUT, THEME)
  console.log("wrote", OUT)
}

build().catch((e) => { console.error(e); process.exit(1) })
