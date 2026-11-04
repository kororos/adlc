import { Bot, CircleDashed, Clock, LoaderCircle, MoonStar, Rocket, TrainFront, Workflow } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { buildActivity, type ActivityItem, type LiveJob } from "@/lib/activity"
import type { Project } from "@/lib/api"
import { ago, duration } from "@/lib/format"
import { currentPhaseLabel } from "@/lib/phases"
import { TRAIN_LABEL, TRAIN_TONE } from "@/lib/train"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

const since = (iso: string | null, now: number) => (iso ? duration(now - new Date(iso).getTime()) : "–")

function Job({ j, now }: { j: LiveJob; now: number }) {
  const running = j.job.status === "in_progress"
  return (
    <a href={j.job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs hover:text-primary">
      {running ? <LoaderCircle className="size-3 animate-spin text-primary" /> : <CircleDashed className="size-3 text-amber-500" />}
      {j.job.name}
      <span className="text-muted-foreground">
        {running ? `${j.job.host ? `on ${j.job.host} · ` : ""}${since(j.job.startedAt, now)}` : `waiting ${since(j.job.queuedAt, now)}`}
      </span>
    </a>
  )
}

function Row({ it, repo, now, onOpenRun }: { it: ActivityItem; repo: string; now: number; onOpenRun: (issue: number) => void }) {
  return (
    <li className="grid gap-1.5 py-3 first:pt-0 last:pb-0" data-testid={`activity-${it.issue}`}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <a href={`https://github.com/${repo}/issues/${it.issue}`} target="_blank" rel="noreferrer" className="min-w-0 truncate font-medium hover:text-primary">
          <span className="font-mono text-muted-foreground">#{it.issue}</span> {it.title}
        </a>
        {it.pr && (
          <a href={`https://github.com/${repo}/pull/${it.pr}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted-foreground hover:text-primary">PR #{it.pr}</a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        {it.delivery && (
          <button type="button" onClick={() => onOpenRun(it.issue)} className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <Bot className="size-4" />agent: {currentPhaseLabel(it.delivery.progress)}
            {it.delivery.run && <span className="text-muted-foreground">· {since(it.delivery.run.started, now)}</span>}
          </button>
        )}
        {it.train && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <TrainFront className="size-4 text-muted-foreground" />
            <span className={cn("font-medium", TRAIN_TONE[it.train.status] ?? "text-foreground")}>train: {TRAIN_LABEL[it.train.status] ?? it.train.status}</span>
          </span>
        )}
        {it.jobs.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Workflow className="size-4 text-muted-foreground" />
            {it.jobs.map((j) => <Job key={`${j.run.id}-${j.job.name}`} j={j} now={now} />)}
            {it.finished > 0 && <span className="text-xs text-muted-foreground">{it.finished} done</span>}
          </span>
        )}
      </div>
      {it.train?.detail && <p className="text-xs text-muted-foreground">{it.train.detail}</p>}
    </li>
  )
}

// The Now tab's overview: everything in flight, one row per issue, then the background lanes.
export function ActivityPanel({ p, onOpenRun }: { p: Project; onOpenRun: (issue: number) => void }) {
  const now = useNow(10_000)
  const a = buildActivity(p)
  const ciJobs = a.items.reduce((n, it) => n + it.jobs.length, 0) + a.background.length
  const trainFront = a.items.find((it) => it.train && it.train.status !== "needs-you" && it.train.status !== "merged")
  const summary = [
    p.active.length ? `${p.active.length} delivery run${p.active.length > 1 ? "s" : ""}` : p.paused ? "paused" : "no delivery run",
    trainFront ? `train: ${TRAIN_LABEL[trainFront.train!.status]} PR #${trainFront.pr}` : a.trainQueued.length ? `${a.trainQueued.length} PR(s) in the train` : "",
    ciJobs ? `${ciJobs} CI job${ciJobs > 1 ? "s" : ""}` : "CI idle",
    a.deploy.state === "deploying" ? "dev deploying" : a.deploy.state === "waiting-secrets" ? "dev waits for secrets" : a.deploy.state === "error" ? "dev deploy failing" : "",
    a.nightlyRunning ? "nightly running" : "",
  ].filter(Boolean)

  return (
    <Card data-testid="activity">
      <CardHeader>
        <CardTitle className="text-base">What's happening</CardTitle>
        <CardDescription>{summary.join(" · ")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {a.items.length > 0 ? (
          <ul className="divide-y">{a.items.map((it) => <Row key={it.issue} it={it} repo={p.repo} now={now} onOpenRun={onOpenRun} />)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">No issue is being worked on, merged or checked right now.</p>
        )}
        {a.trainQueued.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <TrainFront className="size-4" />Next in the train:
            {a.trainQueued.map((t) => (
              <a key={t.pr} href={`https://github.com/${p.repo}/pull/${t.pr}`} target="_blank" rel="noreferrer" className="font-mono hover:text-primary">PR #{t.pr}</a>
            ))}
          </p>
        )}
        {(a.background.length > 0 || a.deploy.state !== "idle" || a.nightlyRunning) && (
          <div className="grid gap-2 border-t pt-3 text-sm">
            {a.background.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Workflow className="size-4 text-muted-foreground" /><span className="text-muted-foreground">Other CI:</span>
                {a.background.map((j) => <span key={`${j.run.id}-${j.job.name}`} className="inline-flex items-center gap-1"><span className="text-xs text-muted-foreground">{j.run.workflow} ({j.run.branch})</span><Job j={j} now={now} /></span>)}
              </div>
            )}
            {a.deploy.state !== "idle" && (
              <p className={cn("flex flex-wrap items-center gap-1.5", a.deploy.state === "error" || a.deploy.state === "waiting-secrets" ? "text-amber-600" : "")}>
                <Rocket className="size-4" />Dev deploy: {a.deploy.detail}
                {a.deploy.since && <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="size-3.5" />{ago(a.deploy.since)}</span>}
              </p>
            )}
            {a.nightlyRunning && p.nightly?.last && (
              <p className="flex items-center gap-1.5">
                <MoonStar className="size-4" />Nightly checks running since {ago(p.nightly.last.createdAt)} ·{" "}
                <a href={p.nightly.last.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">open run</a>
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Dev is at {a.deploy.at ?? "–"}.</p>
      </CardContent>
    </Card>
  )
}
