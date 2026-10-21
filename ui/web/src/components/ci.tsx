import { CircleCheck, CircleDashed, CircleMinus, CircleX, Clock, ExternalLink, GitBranch, GitPullRequest, LoaderCircle, Workflow } from "lucide-react"
import { EmptyState, Stat } from "@/components/chrome"
import { Freshness } from "@/components/status"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CiJob, CiRole, CiRun, Project } from "@/lib/api"
import { duration } from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

const ROLE: Record<CiRole, { label: string; className: string }> = {
  test: { label: "test runner", className: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  publish: { label: "publish runner", className: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  kvm: { label: "kvm runner", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  "self-hosted": { label: "self-hosted", className: "bg-muted text-muted-foreground" },
  github: { label: "GitHub-hosted", className: "bg-muted text-muted-foreground" },
}

// A queued job has no runner yet: say which one it waits for, from the labels it asked for.
function wantedRole(j: CiJob): CiRole | null {
  if (j.role) return j.role
  if (j.labels.includes("adlc-kvm")) return "kvm"
  if (j.labels.includes("adlc-publish")) return "publish"
  if (j.labels.includes("adlc-test")) return "test"
  if (j.labels.some((l) => l.startsWith("ubuntu") || l.startsWith("macos") || l.startsWith("windows"))) return "github"
  return null
}

function RoleBadge({ role }: { role: CiRole | null }) {
  if (!role) return null
  const r = ROLE[role]
  return <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", r.className)}>{r.label}</span>
}

function Context({ run }: { run: CiRun }) {
  return run.pr ? (
    <span className="inline-flex items-center gap-1"><GitPullRequest className="size-3.5" />PR #{run.pr}</span>
  ) : (
    <span className="inline-flex min-w-0 items-center gap-1"><GitBranch className="size-3.5 shrink-0" /><span className="truncate">{run.branch}</span></span>
  )
}

const since = (iso: string | null, now: number) => (iso ? duration(now - new Date(iso).getTime()) : "–")

function JobRow({ run, job, now, waiting }: { run: CiRun; job: CiJob; now: number; waiting?: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      {waiting ? <CircleDashed className="size-4 text-amber-500" /> : <LoaderCircle className="size-4 animate-spin text-primary" />}
      <a href={job.url} target="_blank" rel="noreferrer" className="font-medium hover:text-primary">{run.workflow} / {job.name}</a>
      <RoleBadge role={waiting ? wantedRole(job) : job.role} />
      <span className="text-sm text-muted-foreground"><Context run={run} /></span>
      <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
        <Clock className="size-3.5" />{waiting ? `waiting ${since(job.queuedAt, now)}` : `running ${since(job.startedAt, now)}`}
      </span>
    </li>
  )
}

function Conclusion({ c }: { c: string | null }) {
  if (c === "success") return <CircleCheck className="size-4 text-emerald-500" />
  if (c === "failure" || c === "timed_out" || c === "startup_failure") return <CircleX className="size-4 text-red-500" />
  return <CircleMinus className="size-4 text-muted-foreground" />
}

export function CiTab({ p }: { p: Project }) {
  const now = useNow(10_000)
  const a = p.snapshot?.actions
  if (!a) {
    return <EmptyState icon={Workflow} title="No CI data yet">The runner adds GitHub Actions to its snapshot every minute.</EmptyState>
  }
  const pairs = a.runs.flatMap((run) => run.jobs.map((job) => ({ run, job })))
  const running = pairs.filter(({ job }) => job.status === "in_progress")
  const waiting = pairs.filter(({ job }) => job.status !== "in_progress" && job.status !== "completed")
    .sort((x, y) => (x.job.queuedAt ?? "").localeCompare(y.job.queuedAt ?? ""))
  const finished = a.runs.filter((r) => r.status === "completed")
  const busy = new Set(running.map(({ job }) => job.role).filter(Boolean))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={LoaderCircle} label="Running" value={running.length} tone={running.length ? "primary" : "default"}
          hint={busy.size ? [...busy].map((r) => ROLE[r as CiRole].label).join(", ") : "all runners idle"} />
        <Stat icon={CircleDashed} label="Waiting" value={waiting.length} tone={waiting.length ? "warn" : "default"}
          hint={waiting.length ? `longest ${since(waiting[0].job.queuedAt, now)}` : "nothing queued"} />
        <Stat icon={CircleCheck} label="Finished (6 h)" value={finished.length}
          hint={`${finished.filter((r) => r.conclusion === "failure").length} failed`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Running and waiting</span>
            <Freshness iso={a.generatedAt} staleAfterMin={5} />
          </CardTitle>
          {a.error && <CardDescription className="text-amber-600">Couldn't read GitHub Actions: {a.error}</CardDescription>}
        </CardHeader>
        <CardContent>
          {running.length + waiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs are running or waiting.</p>
          ) : (
            <ul className="divide-y">
              {running.map(({ run, job }) => <JobRow key={`${run.id}-${job.name}`} run={run} job={job} now={now} />)}
              {waiting.map(({ run, job }) => <JobRow key={`${run.id}-${job.name}`} run={run} job={job} now={now} waiting />)}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recently finished</CardTitle><CardDescription>Workflow runs of the last 6 hours</CardDescription></CardHeader>
        <CardContent>
          {finished.length === 0 ? <p className="text-sm text-muted-foreground">None in the last 6 hours.</p> : (
            <ul className="divide-y">
              {finished.map((run) => {
                const failed = run.jobs.filter((j) => j.conclusion === "failure" || j.conclusion === "timed_out")
                const took = run.startedAt ? new Date(run.updatedAt).getTime() - new Date(run.startedAt).getTime() : null
                return (
                  <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <Conclusion c={run.conclusion} />
                    <a href={run.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary">
                      {run.workflow}<ExternalLink className="size-3 opacity-50" />
                    </a>
                    <span className="text-sm text-muted-foreground"><Context run={run} /></span>
                    {run.event === "workflow_dispatch" && <span className="text-xs text-muted-foreground">dispatched</span>}
                    {failed.length > 0 && (
                      <span className="text-sm text-red-600 dark:text-red-400">
                        {failed.map((j) => <a key={j.name} href={j.url} target="_blank" rel="noreferrer" className="mr-2 hover:underline">{j.name}</a>)}
                      </span>
                    )}
                    {run.conclusion && !["success", "failure"].includes(run.conclusion) && (
                      <span className="text-xs text-muted-foreground">{run.conclusion.replace("_", " ")}</span>
                    )}
                    <span className="ml-auto text-sm text-muted-foreground tabular-nums">{duration(took)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
