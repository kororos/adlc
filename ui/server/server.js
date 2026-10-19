// ADLC dashboard server.
//
// Reads the runners' files READ-ONLY (state, logs, the GitHub snapshot the poller writes) and
// never holds GitHub or Claude credentials or the Docker socket. The only thing it writes is a
// request file (pause/resume) that the project's poller applies and logs.
//
//   ADLC_DATA        /data: config/ (ro), projects/ (ro), ui/ (requests, token)
//   ADLC_UI_TOKEN    login token file (default $ADLC_DATA/ui/token), created by `adlc ui`
//   ADLC_UI_HOSTS    extra Host names allowed for actions, e.g. adlc.example.com (reverse proxy)
//   PORT             default 8080
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { fileURLToPath } from "node:url"
import Fastify from "fastify"
import fastifyStatic from "@fastify/static"
import { COMPONENTS, RUN_FILE_RE, SLUG_RE, eventsFromLine, mtime, parseEnv, readJson, runSummary, stripAnsi, tailLines } from "./lib.js"

const DATA = process.env.ADLC_DATA ?? "/data"
const TOKEN_FILE = process.env.ADLC_UI_TOKEN ?? path.join(DATA, "ui", "token")
const EXTRA_HOSTS = (process.env.ADLC_UI_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "public")
const ACTIONS = new Set(["pause", "resume"])

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true, bodyLimit: 16 * 1024 })

// ── Auth: one shared login token; the session cookie is an HMAC of it, so rotating the token
//    (adlc ui token --rotate) signs everyone out.
const token = () => { try { return fs.readFileSync(TOKEN_FILE, "utf8").trim() } catch { return "" } }
const sessionValue = (t) => crypto.createHmac("sha256", t).update("adlc-ui-session-v1").digest("hex")
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
const cookie = (req, name) => {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=")
    if (k === name) return decodeURIComponent(v.join("="))
  }
  return ""
}
const authed = (req) => { const t = token(); return Boolean(t) && safeEq(cookie(req, "adlc_ui"), sessionValue(t)) }
const setSession = (req, reply, value, maxAge) => {
  const secure = req.protocol === "https" ? "; Secure" : ""
  reply.header("set-cookie", `adlc_ui=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`)
}

const attempts = new Map() // ip → { n, reset }
function rateLimited(ip) {
  const now = Date.now()
  const a = attempts.get(ip) ?? { n: 0, reset: now + 15 * 60_000 }
  if (now > a.reset) { a.n = 0; a.reset = now + 15 * 60_000 }
  a.n += 1
  attempts.set(ip, a)
  return a.n > 10
}

app.addHook("onSend", async (req, reply) => {
  reply.header("x-content-type-options", "nosniff")
  reply.header("referrer-policy", "same-origin")
  reply.header("content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
})

app.addHook("onRequest", async (req, reply) => {
  if (!req.url.startsWith("/api/")) return
  if (req.method !== "GET" && req.method !== "HEAD") {
    // CSRF: a custom header can't be sent cross-site without CORS (which we never allow), and
    // the Origin, when present, must be this host.
    if (req.headers["x-adlc-request"] !== "1") return reply.code(403).send({ error: "missing x-adlc-request header" })
    const origin = req.headers.origin
    if (origin) {
      let host = ""
      try { host = new URL(origin).host.toLowerCase() } catch { return reply.code(403).send({ error: "bad origin" }) }
      const hosts = [String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").toLowerCase(), ...EXTRA_HOSTS]
      if (!hosts.some((h) => h && (h === host || h.split(":")[0] === host.split(":")[0]))) {
        return reply.code(403).send({ error: "cross-origin request refused" })
      }
    }
  }
  if (req.url === "/api/session" || req.url === "/api/login") return
  if (!authed(req)) return reply.code(401).send({ error: "sign in required" })
})

app.get("/api/session", async (req) => ({ authenticated: authed(req), configured: Boolean(token()) }))

app.post("/api/login", async (req, reply) => {
  if (rateLimited(req.ip)) return reply.code(429).send({ error: "too many attempts; try again in 15 minutes" })
  const t = token()
  const given = String(req.body?.token ?? "").trim()
  if (!t || !given || !safeEq(sessionValue(given), sessionValue(t))) return reply.code(401).send({ error: "wrong token" })
  attempts.delete(req.ip)
  setSession(req, reply, sessionValue(t), 60 * 60 * 24 * 30)
  return { ok: true }
})

app.post("/api/logout", async (req, reply) => { setSession(req, reply, "", 0); return { ok: true } })

// ── Projects ─────────────────────────────────────────────────────────────────
function projects() {
  const dir = path.join(DATA, "config")
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".env")) } catch { /* no projects yet */ }
  return files.map((f) => f.slice(0, -4)).filter((s) => SLUG_RE.test(s)).sort().map((slug) => {
    const env = parseEnv(fs.readFileSync(path.join(dir, `${slug}.env`), "utf8"))
    return { slug, repo: env.ADLC_REPO ?? "", baseDomain: env.ADLC_BASE_DOMAIN ?? "" }
  })
}
const project = (slug) => (SLUG_RE.test(slug) ? projects().find((p) => p.slug === slug) : undefined)
const pdir = (slug, ...p) => path.join(DATA, "projects", slug, ...p)

function runs(slug, limit = 50) {
  const dir = pdir(slug, "logs", "runs")
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => RUN_FILE_RE.test(f)) } catch { /* none */ }
  files.sort((a, b) => b.split("-")[1].localeCompare(a.split("-")[1]))
  return files.slice(0, limit).map((f) => runSummary(dir, f)).filter(Boolean)
}

function state(p) {
  const st = (...f) => pdir(p.slug, "state", ...f)
  const snapshot = readJson(st("github.json"))
  const titles = new Map((snapshot?.queue ?? []).map((q) => [q.number, q.title]))
  let running = []
  try { running = fs.readdirSync(st("running")).filter((f) => f.endsWith(".pid")).map((f) => Number(f.slice(0, -4))) } catch { /* none */ }
  const all = runs(p.slug, 200)
  // The run's own progress record, in its worktree: runs/<n>/.adlc/runs/<n>/state.json
  const runState = (n) => {
    const j = readJson(pdir(p.slug, "runs", String(n), ".adlc", "runs", String(n), "state.json"))
    return j ? { phase: String(j.phase ?? ""), risk: j.risk ?? null, tasks: Array.isArray(j.waves) ? j.waves.flat().length : null } : null
  }
  const active = running.map((n) => ({ issue: n, title: titles.get(n) ?? "", run: all.find((r) => r.issue === n) ?? null, progress: runState(n) }))
  let backoffUntil = null
  try {
    const u = Number(fs.readFileSync(st("backoff_until"), "utf8"))
    if (u * 1000 > Date.now()) backoffUntil = new Date(u * 1000).toISOString()
  } catch { /* none */ }
  // Requests the runner hasn't applied yet: { action, at } from "<epoch-ms>-<action>.json".
  let pending = []
  try {
    pending = fs.readdirSync(path.join(DATA, "ui", "requests", p.slug))
      .map((f) => f.match(/^(\d+)-([a-z]+)\.json$/)).filter(Boolean)
      .map(([, ms, action]) => ({ action, at: new Date(Number(ms)).toISOString() }))
  } catch { /* none */ }
  let devDeployed = null
  try { devDeployed = fs.readFileSync(st("dev_deployed"), "utf8").trim() } catch { /* never */ }
  const health = Object.fromEntries(COMPONENTS.map((c) => {
    const f = pdir(p.slug, "logs", `${c}.log`)
    return [c, { updated: mtime(f), last: stripAnsi(tailLines(f, 1)[0] ?? "").slice(0, 300) }]
  }))
  return {
    ...p,
    paused: fs.existsSync(st("paused")),
    loggedIn: fs.existsSync(st("logged_in")),
    backoffUntil, pending, devDeployed, active, health,
    snapshot,
  }
}

app.get("/api/projects", async () => projects().map((p) => {
  const s = state(p)
  return { slug: s.slug, repo: s.repo, paused: s.paused, backoffUntil: s.backoffUntil, pending: s.pending,
    active: s.active, counts: s.snapshot?.counts ?? null, snapshotAt: s.snapshot?.generatedAt ?? null,
    attention: s.snapshot?.attention?.length ?? 0,
    reviews: (s.snapshot?.pullRequests ?? []).filter((pr) => pr.labels.includes("adlc:needs-human-review")).length }
}))

app.get("/api/projects/:slug", async (req, reply) => {
  const p = project(req.params.slug)
  return p ? state(p) : reply.code(404).send({ error: "unknown project" })
})

app.get("/api/projects/:slug/runs", async (req, reply) => {
  const p = project(req.params.slug)
  if (!p) return reply.code(404).send({ error: "unknown project" })
  return runs(p.slug, Math.min(Number(req.query.limit ?? 50) || 50, 500))
})

app.post("/api/projects/:slug/actions", async (req, reply) => {
  const p = project(req.params.slug)
  if (!p) return reply.code(404).send({ error: "unknown project" })
  const action = String(req.body?.action ?? "")
  if (!ACTIONS.has(action)) return reply.code(400).send({ error: "unknown action" })
  const dir = path.join(DATA, "ui", "requests", p.slug)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${Date.now()}-${action}.json`)
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ action, at: new Date().toISOString(), from: req.ip }))
  fs.renameSync(`${file}.tmp`, file)
  req.log.info({ project: p.slug, action }, "dashboard action requested")
  return reply.code(202).send({ ok: true, note: "the runner applies it within a minute" })
})

// ── Live streams (server-sent events) ────────────────────────────────────────
function sse(req, reply) {
  reply.hijack()
  const res = reply.raw
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" })
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  const timers = [setInterval(() => res.write(": ping\n\n"), 15_000)]
  req.raw.on("close", () => timers.forEach(clearInterval))
  return { send, timers }
}

// Follow a growing file from `pos`, line by line.
function follow(file, pos, onLines, timers) {
  let rest = ""
  timers.push(setInterval(() => {
    let size
    try { size = fs.statSync(file).size } catch { return }
    if (size < pos) pos = 0
    if (size === pos) return
    const fd = fs.openSync(file, "r")
    const buf = Buffer.alloc(size - pos)
    fs.readSync(fd, buf, 0, buf.length, pos)
    fs.closeSync(fd)
    pos = size
    const lines = (rest + buf.toString("utf8")).split("\n")
    rest = lines.pop() ?? ""
    if (lines.length) onLines(lines)
  }, 1000))
}

app.get("/api/projects/:slug/runs/:file/events", async (req, reply) => {
  const p = project(req.params.slug)
  if (!p || !RUN_FILE_RE.test(req.params.file)) return reply.code(404).send({ error: "unknown run" })
  const file = pdir(p.slug, "logs", "runs", req.params.file)
  if (!fs.existsSync(file)) return reply.code(404).send({ error: "unknown run" })
  const withSub = req.query.subagents === "1"
  const keep = (e) => withSub || !e.sub
  const { send, timers } = sse(req, reply)
  const backlog = []
  let pos = 0
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    pos += Buffer.byteLength(line) + 1
    for (const e of eventsFromLine(line)) if (keep(e)) { backlog.push(e); if (backlog.length > 3000) backlog.shift() }
  }
  pos = Math.min(pos, fs.statSync(file).size)
  send("backlog", backlog)
  follow(file, pos, (lines) => {
    const evs = lines.flatMap(eventsFromLine).filter(keep)
    if (evs.length) send("events", evs)
  }, timers)
})

app.get("/api/projects/:slug/logs/:component", async (req, reply) => {
  const p = project(req.params.slug)
  if (!p || !COMPONENTS.includes(req.params.component)) return reply.code(404).send({ error: "unknown log" })
  const file = pdir(p.slug, "logs", `${req.params.component}.log`)
  const { send, timers } = sse(req, reply)
  send("backlog", tailLines(file, 300).map(stripAnsi))
  let pos = 0
  try { pos = fs.statSync(file).size } catch { /* not yet */ }
  follow(file, pos, (lines) => send("lines", lines.map(stripAnsi)), timers)
})

// ── The web app ──────────────────────────────────────────────────────────────
if (fs.existsSync(PUBLIC)) {
  await app.register(fastifyStatic, { root: PUBLIC, wildcard: false, setHeaders: (res, p) => {
    res.setHeader("cache-control", p.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache")
  } })
  app.setNotFoundHandler((req, reply) => (req.url.startsWith("/api/")
    ? reply.code(404).send({ error: "not found" })
    : reply.header("cache-control", "no-cache").sendFile("index.html")))
}

app.get("/healthz", async () => "ok")

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 8080) })
