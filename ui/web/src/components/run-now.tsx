import { CircleCheck, CircleX, LoaderCircle } from "lucide-react"
import type { ActiveRun, Job, JobSegment } from "@/lib/api"
import { ago, duration, elapsedMs } from "@/lib/format"
import { cn } from "@/lib/utils"

const UNIT: Record<JobSegment["tool"], string> = {
  vitest: "test files", jest: "test files", playwright: "tests", maestro: "flows", attempts: "flows", gradle: "build tasks",
}

// What the run is doing right now: the step (subagent) it waits for and its long jobs (test suites,
// app builds, e2e) with live counts. The poller refreshes every 10 s.
export function RunNow({ a }: { a: ActiveRun }) {
  const jobs = a.jobs ?? []
  if (!a.step && !jobs.length) return null
  const [current, ...earlier] = jobs
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
      {a.step?.parallel && a.step.parallel.length > 1 && (
        <div className="grid gap-1">
          <p><span className="text-muted-foreground">Now: </span><span className="font-medium">{a.step.parallel.length} subagents at once</span></p>
          {a.step.parallel.map((x, i) => (
            <div key={i} className="grid gap-0.5 pl-3">
              <p className="text-xs"><span className="font-medium">{x.agent}</span>{x.what && <> · {x.what}</>}{x.since && <span className="text-muted-foreground"> · since {ago(x.since)}</span>}</p>
              {x.doing && (
                <p className="flex min-w-0 items-center gap-1.5 pl-2 text-[11px] text-muted-foreground" title={x.doing.what}>
                  {x.doing.running ? <LoaderCircle className="size-3 shrink-0 animate-spin text-primary" /> : <CircleCheck className="size-3 shrink-0" />}
                  <span className="truncate font-mono text-foreground/80">{x.doing.what}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {a.step && !(a.step.parallel && a.step.parallel.length > 1) && (
        <p>
          <span className="text-muted-foreground">Now: </span>
          <span className="font-medium">{a.step.agent}</span>
          {a.step.what && <> · {a.step.what}</>}
          {a.step.since && <span className="text-muted-foreground"> · since {ago(a.step.since)}</span>}
        </p>
      )}
      {a.step?.doing && !(a.step.parallel && a.step.parallel.length > 1) && (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={a.step.doing.what}>
          {a.step.doing.running ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" /> : <CircleCheck className="size-3.5 shrink-0" />}
          <span className="shrink-0">{a.step.doing.running ? "running" : "last"}:</span>
          <span className="truncate font-mono text-foreground/80">{a.step.doing.what}</span>
          {a.step.doing.since && <span className="shrink-0">· {a.step.doing.running ? "started" : ""} {ago(a.step.doing.since)}</span>}
        </p>
      )}
      {a.step?.doing?.running && a.step.doing.log && (
        <div className="grid gap-1.5">
          <p className="pl-5 text-[11px] text-muted-foreground">
            output: <span className="font-mono">{a.step.doing.log.name}</span>
            {a.step.doing.log.updated && <> · written {ago(a.step.doing.log.updated)}</>}
          </p>
          {a.step.doing.log.segments.map((s, i) => <SegmentRow key={i} s={s} active={i === a.step!.doing!.log!.segments.length - 1} />)}
          {a.step.doing.log.last && <p className="truncate pl-6 font-mono text-[11px] text-muted-foreground" title={a.step.doing.log.last}>{a.step.doing.log.last}</p>}
        </div>
      )}
      {current && <JobRow job={current} />}
      {earlier.length > 0 && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer text-xs">earlier jobs in this run ({earlier.length})</summary>
          <div className="mt-2 grid gap-2">{earlier.map((j) => <JobRow key={j.name + j.started} job={j} />)}</div>
        </details>
      )}
    </div>
  )
}

function JobRow({ job }: { job: Job }) {
  const running = job.exitCode === null
  const took = elapsedMs(job.started, job.ended)
  const Icon = running ? LoaderCircle : job.exitCode === 0 ? CircleCheck : CircleX
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon className={cn("size-4", running ? "animate-spin text-primary" : job.exitCode === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")} />
        <span className="font-mono text-xs" title={job.cmd || undefined}>{job.name}</span>
        <span className="text-xs text-muted-foreground">
          {running ? `running for ${duration(took)}` : `${job.exitCode === 0 ? "passed" : `failed (exit ${job.exitCode})`} in ${duration(took)}`}
        </span>
        {job.markers.filter((m) => m.name !== "EXIT_CODE").map((m) => (
          <span key={m.name} className={cn("rounded px-1.5 text-[11px]", m.code === 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400")}>
            {m.name.replace(/_EXIT$/, "").toLowerCase()} {m.code === 0 ? "ok" : `exit ${m.code}`}
          </span>
        ))}
      </div>
      {job.segments.map((s, i) => <SegmentRow key={i} s={s} active={running && i === job.segments.length - 1} />)}
      {running && job.last && <p className="truncate font-mono text-[11px] text-muted-foreground" title={job.last}>{job.last}</p>}
    </div>
  )
}

function SegmentRow({ s, active }: { s: JobSegment; active: boolean }) {
  const total = s.total ?? s.expected?.total ?? null
  const pct = total ? Math.min(100, Math.round((s.done / total) * 100)) : null
  const estimate = !s.total && s.expected
  const passed = s.done - s.failed
  return (
    <div className="grid gap-1 pl-6">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="font-medium">{s.label}</span>
        <span>
          {s.tool === "gradle" ? `${s.done}${!s.finished && total ? ` of ${estimate ? "~" : ""}${total}` : ""} ${UNIT[s.tool]}${s.finished ? (s.failed ? ", build failed" : `, built${s.took ? ` in ${s.took}` : ""}`) : ""}`
            : <>{passed} passed{s.failed ? <span className="text-red-600 dark:text-red-400">, {s.failed} failed</span> : null}
              {total ? <> of {estimate ? "~" : ""}{total} {UNIT[s.tool]}</> : <> {UNIT[s.tool]}</>}</>}
        </span>
        {s.current && !s.finished && <span className="text-muted-foreground">· now {s.current}</span>}
        {s.finished && s.durationS != null && <span className="text-muted-foreground">· {duration(s.durationS * 1000)}</span>}
        {estimate && s.expected?.durationS ? <span className="text-muted-foreground" title="The largest recent run of this suite">· {s.tool === "gradle" ? "a full build took" : "a whole run took"} {duration(s.expected.durationS * 1000)}</span> : null}
      </div>
      {pct !== null && (s.tool !== "gradle" || !s.finished) && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full rounded-full", s.failed ? "bg-red-500" : "bg-primary", active && !s.finished && "animate-pulse")} style={{ width: `${s.finished ? 100 : pct}%` }} />
        </div>
      )}
    </div>
  )
}
