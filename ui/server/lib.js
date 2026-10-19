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
