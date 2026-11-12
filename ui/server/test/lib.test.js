import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { cpuPct, eventsFromLine, hostReport, memInfo, parseEnv, procStat, runSummary, runTotals, stripAnsi, tailLines } from "../lib.js"

test("parseEnv keeps values and strips quotes", () => {
  assert.deepEqual(parseEnv("ADLC_REPO=kororos/diet\nADLC_REGISTRY_USER='robot$x'\n# c\n"), { ADLC_REPO: "kororos/diet", ADLC_REGISTRY_USER: "robot$x" })
})

test("assistant text and tool calls become events; subagent lines are marked", () => {
  const line = JSON.stringify({ type: "assistant", parent_tool_use_id: null, message: { content: [
    { type: "text", text: "Starting Understand." },
    { type: "tool_use", name: "Agent", input: { subagent_type: "adlc-core:codebase-scout", description: "map the repo" } },
    { type: "tool_use", name: "Bash", input: { command: "git status", description: "Show status" } },
  ] } })
  assert.deepEqual(eventsFromLine(line), [
    { kind: "text", text: "Starting Understand.", sub: false },
    { kind: "tool", tool: "Agent", summary: "adlc-core:codebase-scout: map the repo", sub: false },
    { kind: "tool", tool: "Bash", summary: "Show status", sub: false },
  ])
  const sub = JSON.stringify({ type: "assistant", parent_tool_use_id: "toolu_1", message: { content: [{ type: "text", text: "inner" }] } })
  assert.equal(eventsFromLine(sub)[0].sub, true)
})

test("result lines carry cost and outcome; junk lines are ignored", () => {
  const r = eventsFromLine(JSON.stringify({ type: "result", subtype: "success", total_cost_usd: 2.5, duration_ms: 1000, num_turns: 7, result: "done" }))
  assert.deepEqual(r, [{ kind: "result", sub: false, outcome: "success", error: false, costUsd: 2.5, durationMs: 1000, turns: 7, text: "done" }])
  assert.deepEqual(eventsFromLine("not json"), [])
  assert.deepEqual(eventsFromLine(JSON.stringify({ type: "user" })), [])
})

test("runSummary reads issue, start and the last top-level result", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adlc-ui-"))
  const lines = [
    { type: "system", subtype: "init", model: "sonnet" },
    { type: "result", parent_tool_use_id: "x", subtype: "success", total_cost_usd: 0.1 },
    { type: "result", subtype: "success", total_cost_usd: 2.99, duration_ms: 5 },
  ].map((l) => JSON.stringify(l)).join("\n")
  fs.writeFileSync(path.join(dir, "26-20261019T091428Z.jsonl"), `${lines}\n`)
  const s = runSummary(dir, "26-20261019T091428Z.jsonl")
  assert.equal(s.issue, 26)
  assert.equal(s.started, "2026-10-19T09:14:28Z")
  assert.equal(s.result.costUsd, 2.99)
  assert.equal(runSummary(dir, "../etc/passwd"), null)
})

test("tailLines and stripAnsi", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "adlc-ui-")), "x.log")
  fs.writeFileSync(f, "a\nb\nc\n")
  assert.deepEqual(tailLines(f, 2), ["b", "c"])
  assert.deepEqual(tailLines(f + "missing", 2), [])
  assert.equal(stripAnsi("\x1b[32mok\x1b[0m\r"), "ok")
})

test("runTotals sums cost and time over all runs and the last 30 days", () => {
  const now = Date.parse("2026-10-26T12:00:00Z")
  const t = runTotals([
    { started: "2026-10-25T10:00:00Z", result: { costUsd: 2.5, durationMs: 1000 } },
    { started: "2026-10-24T10:00:00Z", result: null },
    { started: "2026-08-01T10:00:00Z", result: { costUsd: 4, durationMs: 3000 } },
    { started: "2026-08-02T10:00:00Z", result: { costUsd: null, durationMs: null } },
  ], now)
  assert.deepEqual(t, { runs: 4, finished: 3, costUsd: 6.5, durationMs: 4000, last30: { runs: 2, costUsd: 2.5 } })
})

test("procStat, cpuPct and memInfo read /proc", () => {
  const a = procStat("cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 1 2 3 4\n")
  const b = procStat("cpu  200 0 200 1300 100 0 0 0 0 0\n")
  assert.deepEqual(a, { idle: 800, total: 1000 })
  assert.equal(cpuPct(a, b), 25)
  assert.equal(cpuPct(null, b), null)
  assert.equal(procStat("garbage"), null)
  assert.deepEqual(memInfo("MemTotal:       8388608 kB\nMemFree: 1 kB\nMemAvailable:   2097152 kB\n"), { totalGb: 8, usedPct: 75 })
})

test("hostReport keeps known numbers and drops the rest", () => {
  assert.deepEqual(hostReport({ cpuPct: 12.5, load1: 0.7, cores: 4, mem: { totalGb: 16, usedPct: 40 }, disk: { freeGb: 87, totalGb: 144 }, evil: "<x>" }),
    { cpuPct: 12.5, load1: 0.7, cores: 4, mem: { totalGb: 16, usedPct: 40 }, disk: { freeGb: 87, totalGb: 144 } })
  assert.equal(hostReport({ cpuPct: 400 }), null)
  assert.equal(hostReport("x"), null)
  assert.equal(hostReport({ cpuPct: 5, disk: { freeGb: "1" } }).disk, null)
})

test("jobProgress counts vitest files per invocation, with totals, durations and exit markers", async () => {
  const { jobProgress } = await import("../lib.js")
  const log = [
    " RUN  v5.0.5 /srv/adlc/projects/diet/runs/427/apps/api",
    " ✓  api  src/a.http.test.ts (36 tests) 20255ms",
    "   ✓ AC1: a slow test 2063ms",
    " ❯  api  src/b.test.ts (5 tests | 1 failed) 99ms",
    " ❯ test/dev-compose.test.ts:569:21",
    "API_EXIT=1",
    " RUN  v5.0.5 /srv/adlc/projects/diet/runs/427/tools/arch",
    " ✓ test/c.test.ts (3 tests) 9ms",
  ].join("\n")
  const p = jobProgress(log)
  assert.deepEqual(p.segments.map((s) => [s.label, s.done, s.failed, s.finished]), [["apps/api", 2, 1, true], ["tools/arch", 1, 0, false]])
  assert.deepEqual(p.markers, [{ name: "API_EXIT", code: 1 }])
  const done = jobProgress(" RUN  v5.0.5 /x/runs/1/apps/api\n ✓ src/a.test.ts (2 tests) 1ms\n Test Files  247 passed | 1 skipped (248)\n   Duration  1168.2s\nEXIT_CODE=0")
  assert.equal(done.segments[0].total, 248)
  assert.equal(done.segments[0].durationS, 1168)
  assert.equal(done.last, "EXIT_CODE=0")
})

test("jobProgress reads Playwright, Gradle, Maestro and reseeded flow attempts", async () => {
  const { jobProgress } = await import("../lib.js")
  const pw = jobProgress("Running 11 tests using 2 workers\n  ✓   1 [chromium] › a.spec.ts:1 › x (3s)\n  ✘   2 [chromium] › b.spec.ts:1 › y (4s)")
  assert.deepEqual(pw.segments.map((s) => [s.tool, s.done, s.failed, s.total]), [["playwright", 2, 1, 11]])
  const and = jobProgress("> Task :app:a\n> Task :app:b\nBUILD SUCCESSFUL in 10m 21s\n[Passed] AC31-start (50s)\n[Failed] AC27-sign-in (1m 9s)\n1/2 Flows Passed in 2m\ne2e-link: link-a attempt 1/3 PASS\ne2e-link: AC13 attempt 1/3 FAIL")
  assert.deepEqual(and.segments.map((s) => [s.tool, s.done, s.failed, s.finished]), [["gradle", 2, 0, true], ["maestro", 2, 1, true], ["attempts", 1, 0, false]])
  assert.equal(and.segments[2].current, "AC13")
})

test("currentStep is the subagent still running, else the lead's last tool", async () => {
  const { currentStep } = await import("../lib.js")
  const call = (id, input, ts) => JSON.stringify({ type: "assistant", timestamp: ts, message: { content: [{ type: "tool_use", id, name: "Agent", input }] } })
  const result = (id) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id }] } })
  const lines = [call("a", { subagent_type: "adlc-core:build-runner", description: "Verify" }, "t1"), result("a"),
    call("b", { subagent_type: "adlc-core:debugger", description: "Fix it" }, "t2"),
    JSON.stringify({ type: "assistant", parent_tool_use_id: "b", message: { content: [{ type: "tool_use", id: "x", name: "Bash", input: { command: "ls" } }] } })]
  assert.deepEqual(currentStep(lines), { agent: "debugger", what: "Fix it", since: "t2", doing: { what: "ls", since: null, running: true, cmd: "ls" } })
  const finished = [...lines, JSON.stringify({ type: "user", parent_tool_use_id: "b", message: { content: [{ type: "tool_result", tool_use_id: "x" }] } })]
  assert.equal(currentStep(finished).doing.running, false)
  assert.equal(currentStep(lines.slice(0, 2)), null)   // finished subagent, no lead tool call since
})

test("commandLog finds the log a command writes to", async () => {
  const { commandLog } = await import("../lib.js")
  assert.equal(commandLog("s=1; timeout 600 pnpm --filter web exec playwright test a b > .adlc/runs/427/reports/logs/qa-e2e-5-a1.log 2>&1; echo x"), ".adlc/runs/427/reports/logs/qa-e2e-5-a1.log")
  assert.equal(commandLog("nohup bash -c 'x' > /srv/adlc/projects/diet/runs/97/a.log 2>&1 &"), "/srv/adlc/projects/diet/runs/97/a.log")
  assert.equal(commandLog("(pnpm -r lint) > $L/lint-4.log 2>&1"), null)
  assert.equal(commandLog("git status"), null)
})
