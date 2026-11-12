// Pure helpers: reading the runner's files and turning `claude -p` stream-json into a narrative.
import fs from "node:fs"
import path from "node:path"

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/
export const RUN_FILE_RE = /^(\d+)-(\d{8}T\d{6}Z)\.jsonl$/
export const COMPONENTS = ["poller", "deployer", "rc"]

// "KEY=value" lines; quotes are stripped. Only the keys the dashboard shows are kept.
export function parseEnv(text) {
  const out = {}
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2")
  }
  return out
}

export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) } catch { return null }
}

export function mtime(file) {
  try { return fs.statSync(file).mtime.toISOString() } catch { return null }
}

// The last `n` lines of a text file without reading all of it.
export function tailLines(file, n, maxBytes = 512 * 1024) {
  let fd
  try {
    fd = fs.openSync(file, "r")
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - maxBytes)
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    const lines = buf.toString("utf8").split("\n")
    if (start > 0) lines.shift()
    if (lines.at(-1) === "") lines.pop()
    return lines.slice(-n)
  } catch {
    return []
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[()][0-9A-Za-z]|\r/g
export const stripAnsi = (s) => s.replace(ANSI, "")

const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? "")

function toolSummary(name, input = {}) {
  switch (name) {
    case "Agent": case "Task": return `${input.subagent_type ?? "agent"}: ${clip(input.description ?? input.prompt, 140)}`
    case "Bash": return clip(input.description || input.command, 160)
    case "Read": case "Write": case "Edit": case "NotebookEdit": return clip(input.file_path, 160)
    case "Grep": return clip(`${input.pattern ?? ""}${input.path ? ` in ${input.path}` : ""}`, 160)
    case "Glob": return clip(input.pattern, 160)
    case "Skill": return clip(input.skill, 80)
    case "TodoWrite": return `${(input.todos ?? []).length} todos`
    default: return ""
  }
}

// One stream-json line → zero or more narrative events.
export function eventsFromLine(line) {
  let j
  try { j = JSON.parse(line) } catch { return [] }
  const sub = Boolean(j.parent_tool_use_id)
  if (j.type === "system" && j.subtype === "init") {
    return [{ kind: "start", model: j.model ?? "", sub }]
  }
  if (j.type === "assistant") {
    const out = []
    for (const c of j.message?.content ?? []) {
      if (c.type === "text" && c.text?.trim()) out.push({ kind: "text", text: clip(c.text.trim(), 4000), sub })
      else if (c.type === "tool_use") out.push({ kind: "tool", tool: c.name, summary: toolSummary(c.name, c.input), sub })
    }
    return out
  }
  if (j.type === "result") {
    return [{
      kind: "result", sub, outcome: j.subtype ?? "", error: Boolean(j.is_error),
      costUsd: j.total_cost_usd ?? null, durationMs: j.duration_ms ?? null, turns: j.num_turns ?? null,
      text: clip(typeof j.result === "string" ? j.result : "", 2000),
    }]
  }
  return []
}

// Summary of a finished or running run log: start time from the file name, outcome from the
// last top-level result line.
export function runSummary(dir, file) {
  const m = file.match(RUN_FILE_RE)
  if (!m) return null
  const [, issue, ts] = m
  const started = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}Z`
  let result = null
  for (const line of tailLines(path.join(dir, file), 50).reverse()) {
    const ev = eventsFromLine(line).find((e) => e.kind === "result" && !e.sub)
    if (ev) { result = ev; break }
  }
  return { file, issue: Number(issue), started, updated: mtime(path.join(dir, file)), result }
}

// All-time and last-30-days totals over run summaries (cost is API-equivalent; unfinished runs count as runs only).
export function runTotals(summaries, now = Date.now()) {
  const since = now - 30 * 24 * 3600 * 1000
  const t = { runs: 0, finished: 0, costUsd: 0, durationMs: 0, last30: { runs: 0, costUsd: 0 } }
  for (const s of summaries) {
    const recent = Date.parse(s.started) >= since
    t.runs++
    if (recent) t.last30.runs++
    if (!s.result) continue
    const cost = s.result.costUsd ?? 0
    t.finished++
    t.costUsd += cost
    t.durationMs += s.result.durationMs ?? 0
    if (recent) t.last30.costUsd += cost
  }
  return t
}

// ── Host stats ───────────────────────────────────────────────────────────────
// /proc/stat's first line: cumulative CPU jiffies (user nice system idle iowait irq softirq steal…).
export function procStat(text) {
  const f = (text.split("\n").find((l) => l.startsWith("cpu ")) ?? "").trim().split(/\s+/).slice(1).map(Number)
  if (f.length < 4 || f.some((n) => !Number.isFinite(n))) return null
  return { idle: f[3] + (f[4] ?? 0), total: f.slice(0, 8).reduce((a, b) => a + b, 0) }
}
// Busy share between two procStat samples, 0–100 (null until there are two).
export function cpuPct(prev, cur) {
  if (!prev || !cur || cur.total <= prev.total) return null
  return Math.round((1 - (cur.idle - prev.idle) / (cur.total - prev.total)) * 1000) / 10
}
// /proc/meminfo: used = total - available (page cache counts as free).
export function memInfo(text) {
  const kb = (k) => Number(text.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"))?.[1])
  const total = kb("MemTotal"), avail = kb("MemAvailable")
  if (!total || !Number.isFinite(avail)) return null
  return { totalGb: Math.round((total / 2 ** 20) * 10) / 10, usedPct: Math.round((1 - avail / total) * 1000) / 10 }
}
export const HOST_RE = /^[a-z0-9][a-z0-9-]{0,31}$/
// A CI host's report, reduced to known numeric fields; null when it isn't one.
export function hostReport(b) {
  const num = (v, max) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null)
  if (!b || typeof b !== "object") return null
  const r = {
    cpuPct: num(b.cpuPct, 100), load1: num(b.load1, 10_000), cores: num(b.cores, 4096),
    mem: b.mem && { totalGb: num(b.mem.totalGb, 1e6), usedPct: num(b.mem.usedPct, 100) },
    disk: b.disk && { freeGb: num(b.disk.freeGb, 1e7), totalGb: num(b.disk.totalGb, 1e7) },
  }
  if (r.disk && (r.disk.freeGb == null || r.disk.totalGb == null)) r.disk = null
  if (r.mem && (r.mem.totalGb == null || r.mem.usedPct == null)) r.mem = null
  return r.cpuPct == null && !r.disk ? null : r
}

// ── Job progress ─────────────────────────────────────────────────────────────
// Long jobs (test suites, app builds, e2e) run detached with adlc-bg: <log>, <log>.start (epoch s),
// <log>.exit (exit code) and <log>.cmd. These turn a log's text into what the Now tab shows: one segment
// per test tool invocation (vitest, jest, Playwright, Maestro, Gradle) with done/failed counts, the
// total when the tool has printed it, and the "<NAME>_EXIT=<n>" markers the agents put between steps.
const VITEST_RUN = /^\s*RUN\s+v\d[\w.-]*\s+(\S+)/
const VITEST_FILE = /^\s*(✓|❯|×|↓)\s+(?:\S+\s+)?\S+\.(?:test|spec)\.[cm]?[jt]sx?\s+\((\d+) tests?([^)]*)\)/
const VITEST_FILES = /^\s*Test Files\s+(.*)\((\d+)\)/
const DURATION = /^\s*Duration\s+([\d.]+)\s*(ms|s)\b/
const JEST_FILE = /^(PASS|FAIL)\s+\S+/
const JEST_SUITES = /^Test Suites:.*?(\d+) total/
const PW_START = /^\s*Running (\d+) tests? using/
const PW_TEST = /^\s*(✓|✘|-)\s+\d+\s+\[/
const PW_DONE = /^\s*(\d+) passed \(([\d.]+)(m?s|m)\)/
const MAESTRO_FLOW = /^\[(Passed|Failed|Skipped)\]\s+(.+?)(?:\s+\((?:[\dhms ]+)\))?$/
const MAESTRO_DONE = /^(\d+)\/(\d+) Flows? (Passed|Failed)/
const ATTEMPT = /^e2e-link: (\S+) (?:attempt \d+\/\d+ (PASS|FAIL)|FAILED after)/
const GRADLE_TASK = /^> Task :/
const GRADLE_DONE = /^BUILD (SUCCESSFUL|FAILED)(?: in (.+))?/
const MARKER = /^([A-Z][A-Z0-9_]*_EXIT|EXIT_CODE)=(\d+)\s*$/

// "/srv/adlc/projects/diet/runs/427/apps/api" → "apps/api"
const relDir = (d) => d.replace(/^.*\/runs\/\d+\//, "").replace(/\/$/, "") || "."

export function jobProgress(text) {
  const segments = []
  const markers = []
  let cur = null
  const open = (tool, label, extra = {}) => { cur = { tool, label, done: 0, failed: 0, total: null, finished: false, ...extra }; segments.push(cur); return cur }
  const ensure = (tool, label) => (cur && cur.tool === tool && !cur.finished ? cur : open(tool, label))
  let last = ""
  for (const raw of text.split("\n")) {
    const line = stripAnsi(raw)
    if (line.trim()) last = line.trim()
    let m
    if ((m = line.match(VITEST_RUN))) open("vitest", relDir(m[1]))
    else if ((m = line.match(VITEST_FILE))) {
      const s = ensure("vitest", "tests")
      s.done++
      if (m[1] === "❯" || m[1] === "×" || /\d+ failed/.test(m[3])) s.failed++
    } else if ((m = line.match(VITEST_FILES)) && cur?.tool === "vitest") {
      cur.total = Number(m[2]); cur.failed = Number(m[1].match(/(\d+) failed/)?.[1] ?? cur.failed); cur.finished = true
      cur.done = cur.total
    } else if ((m = line.match(DURATION)) && cur?.tool === "vitest" && cur.finished) {
      cur.durationS = Math.round(Number(m[1]) / (m[2] === "ms" ? 1000 : 1))
    } else if ((m = line.match(JEST_FILE))) {
      const s = ensure("jest", "tests")
      s.done++
      if (m[1] === "FAIL") s.failed++
    } else if ((m = line.match(JEST_SUITES)) && cur?.tool === "jest") {
      cur.total = Number(m[1]); cur.done = cur.total; cur.finished = true
    } else if ((m = line.match(PW_START))) open("playwright", "e2e", { total: Number(m[1]) })
    else if ((m = line.match(PW_TEST)) && cur?.tool === "playwright") {
      cur.done++
      if (m[1] === "✘") cur.failed++
    } else if ((m = line.match(PW_DONE)) && cur?.tool === "playwright") cur.finished = true
    else if ((m = line.match(MAESTRO_FLOW))) {
      const s = ensure("maestro", "flows")
      s.done++
      if (m[1] === "Failed") s.failed++
    } else if ((m = line.match(MAESTRO_DONE)) && cur?.tool === "maestro") {
      cur.total = Number(m[2]); cur.finished = true
    } else if ((m = line.match(ATTEMPT))) {
      const s = ensure("attempts", "flows with reseed")
      if (m[2] === "PASS") s.done++
      else if (!m[2]) { s.done++; s.failed++ }
      s.current = m[1]
    } else if (GRADLE_TASK.test(line)) ensure("gradle", "app build").done++
    else if ((m = line.match(GRADLE_DONE)) && cur?.tool === "gradle") {
      cur.finished = true
      if (m[1] === "FAILED") cur.failed = 1
      cur.took = m[2] ?? null
    } else if ((m = line.match(MARKER))) {
      markers.push({ name: m[1], code: Number(m[2]) })
      if (cur && !cur.finished) cur.finished = true
    }
  }
  return { segments, markers, last: clip(last, 200) }
}

// The step the run is on, from the end of its stream-json log: the subagent the lead is waiting for
// (Agent/Task call without a result yet), else the lead's own latest tool call. `doing` is that agent's
// latest tool call (a command, a file it edits), with `running` while it has no result yet.
export function currentStep(lines) {
  const open = new Map()   // Agent call id → step
  const calls = new Map()  // tool call id → its `doing`
  let lead = null
  for (const line of lines) {
    let j
    try { j = JSON.parse(line) } catch { continue }
    const parent = j.parent_tool_use_id ?? null
    if (j.type === "assistant") {
      for (const c of j.message?.content ?? []) {
        if (c.type !== "tool_use") continue
        const doing = { what: toolSummary(c.name, c.input), since: j.timestamp ?? null, running: true }
        calls.set(c.id, doing)
        if (parent) { const st = open.get(parent); if (st) st.doing = doing; continue }
        if (c.name === "Agent" || c.name === "Task") {
          open.set(c.id, { agent: String(c.input?.subagent_type ?? "agent").replace(/^adlc-core:/, ""), what: clip(c.input?.description ?? "", 140), since: j.timestamp ?? null, doing: null })
        } else lead = { agent: "lead", what: doing.what, since: doing.since, doing }
      }
    } else if (j.type === "user") {
      for (const c of j.message?.content ?? []) {
        if (c.type !== "tool_result") continue
        if (!parent) open.delete(c.tool_use_id)
        const d = calls.get(c.tool_use_id)
        if (d) d.running = false
      }
    }
  }
  const step = [...open.values()].at(-1) ?? lead
  if (step?.agent === "lead") return { agent: "lead", what: step.what, since: step.since, doing: null }
  return step
}
