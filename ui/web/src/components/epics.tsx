import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowUpToLine, ChevronRight, GitPullRequest, Layers } from "lucide-react"
import { useState } from "react"
import { EmptyState } from "@/components/chrome"
import { StateBadge } from "@/components/status"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { api, queryKeys, type EpicItem, type EpicSub, type Project, type QueueState } from "@/lib/api"
import { cn } from "@/lib/utils"

// Progress segments, in the order the work flows: done, being delivered, waiting for you, startable, waiting.
const SEGMENTS: { key: string; label: string; color: string; states: EpicSub["state"][] }[] = [
  { key: "done", label: "done", color: "bg-emerald-600", states: ["done"] },
  { key: "flight", label: "in flight", color: "bg-blue-600", states: ["in-progress", "pr-open"] },
  { key: "you", label: "needs you", color: "bg-amber-500", states: ["owner", "needs-info", "blocked", "needs-human-review", "flaky", "regression", "spike"] },
  { key: "ready", label: "ready", color: "bg-emerald-400", states: ["ready"] },
  { key: "queued", label: "queued", color: "bg-muted-foreground/30", states: ["queued", "epic", "untracked"] },
]
// Sub-issue order inside an epic: what's moving first, then what needs you, then queue order, done last.
const STATE_ORDER: EpicSub["state"][] = ["in-progress", "pr-open", "needs-human-review", "blocked", "needs-info", "owner",
  "flaky", "regression", "spike", "ready", "queued", "epic", "untracked", "done"]
const QUEUE_STATES = new Set<string>(["owner", "ready", "queued", "in-progress", "pr-open", "needs-info", "blocked", "needs-human-review"])

const finished = (e: EpicItem) => e.total > 0 && e.completed >= e.total

export function EpicsTab({ p, epics }: { p: Project; epics: EpicItem[] }) {
  const [showFinished, setShowFinished] = useState(false)
  if (!epics.length) return <EmptyState icon={Layers} title="No open epics">Epics are issues labelled type:epic; /adlc-core:plan-backlog creates them.</EmptyState>
  const done = epics.filter(finished).length
  const shown = showFinished ? epics : epics.filter((e) => !finished(e))
  const next = epics.filter((e) => e.priority)
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {epics.length} open epics{next.length ? <> · run next: {next.map((e) => `#${e.number}`).join(", ")}</> : null}
          {" · "}Run next on an epic starts its sub-issues before the others (dependencies and the PR limit still apply).
        </span>
        {done > 0 && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} />
            show finished ({done})
          </label>
        )}
      </div>
      {shown.map((e) => <EpicCard key={e.number} p={p} epic={e} />)}
    </div>
  )
}

function EpicCard({ p, epic: e }: { p: Project; epic: EpicItem }) {
  const [open, setOpen] = useState(e.priority)
  const [showDone, setShowDone] = useState(false)
  const subs = [...(e.subs ?? [])].sort((a, b) =>
    STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.number - b.number)
  const count = (states: EpicSub["state"][]) => subs.filter((s) => states.includes(s.state)).length
  const total = e.subs ? subs.length : e.total
  const doneSubs = subs.filter((s) => s.state === "done")
  const openSubs = subs.filter((s) => s.state !== "done")
  return (
    <Card className={cn("gap-0 py-0", e.priority && "ring-1 ring-primary/50")} data-testid={`epic-${e.number}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className="min-w-0">
            <span className="font-mono text-muted-foreground">#{e.number}</span> <span className="font-medium">{e.title}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {e.milestone}{e.parent ? ` · part of #${e.parent}` : ""}
            </span>
          </span>
        </button>
        <a href={e.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary">GitHub</a>
        <EpicRunNext p={p} epic={e} />
      </div>
      <div className="px-4 pb-3">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" title={`${e.completed} of ${e.total} sub-issues closed`}>
          {e.subs
            ? SEGMENTS.map((s) => { const n = count(s.states); return n ? <span key={s.key} className={s.color} style={{ width: `${(n / total) * 100}%` }} /> : null })
            : <span className="bg-emerald-600" style={{ width: `${e.total ? (e.completed / e.total) * 100 : 0}%` }} />}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{e.completed}/{e.total} done</span>
          {e.subs && SEGMENTS.slice(1).map((s) => {
            const n = count(s.states)
            return n ? <span key={s.key} className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", s.color)} />{n} {s.label}</span> : null
          })}
        </div>
      </div>
      {open && (
        <ul className="divide-y border-t">
          {!e.subs && <li className="px-4 py-2 text-sm text-muted-foreground">Sub-issues unavailable in this snapshot.</li>}
          {e.subs && !subs.length && <li className="px-4 py-2 text-sm text-muted-foreground">No sub-issues yet.</li>}
          {openSubs.map((s) => <SubRow key={s.number} s={s} />)}
          {doneSubs.length > 0 && (
            <li className="px-4 py-1.5">
              <button type="button" onClick={() => setShowDone(!showDone)} className="text-xs text-muted-foreground hover:text-primary">
                {showDone ? "hide" : "show"} {doneSubs.length} done
              </button>
            </li>
          )}
          {showDone && doneSubs.map((s) => <SubRow key={s.number} s={s} />)}
        </ul>
      )}
    </Card>
  )
}

function SubRow({ s }: { s: EpicSub }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm", s.state === "done" && "text-muted-foreground")} data-testid={`epic-sub-${s.number}`}>
      <span className="w-10 font-mono text-xs text-muted-foreground" title={s.rank ? "position in the queue" : undefined}>{s.rank ? `${s.rank}.` : ""}</span>
      <a href={s.url} target="_blank" rel="noreferrer" className={cn("min-w-0 flex-1 hover:text-primary", s.state === "done" && "line-through decoration-muted-foreground/40")}>
        <span className="font-mono text-muted-foreground">#{s.number}</span> {s.title}
      </a>
      {s.priority && <Badge className="bg-primary/15 text-primary"><ArrowUpToLine />next</Badge>}
      {s.blockers.length > 0 && <span className="text-xs text-muted-foreground">waits for {s.blockers.slice(0, 3).map((b) => `#${b}`).join(", ")}{s.blockers.length > 3 ? "…" : ""}</span>}
      {s.pr && (
        <a href={s.pr.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
          <GitPullRequest className="size-3.5" />#{s.pr.number}
        </a>
      )}
      <SubState s={s} />
    </li>
  )
}

function SubState({ s }: { s: EpicSub }) {
  if (QUEUE_STATES.has(s.state)) return <StateBadge state={s.state as QueueState} />
  if (s.state === "done") return <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">done</Badge>
  if (s.state === "epic") return <Badge variant="outline">epic {s.completed ?? 0}/{s.total ?? 0}</Badge>
  if (s.state === "untracked") return <Badge variant="outline" className="text-muted-foreground" title="no ADLC state label: the pipeline doesn't run it">no state</Badge>
  return <Badge variant="outline" className="text-amber-600 dark:text-amber-400" title="Needs you → triage">{s.state}</Badge>
}

// "Run next" on an epic: its startable sub-issues go first until you undo it.
export function EpicRunNext({ p, epic: e }: { p: Project; epic: EpicItem }) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: (action: `prioritize:${number}` | `deprioritize:${number}`) => api.action(p.slug, action),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.project(p.slug) }),
  })
  const pending = m.isPending || p.pending.some((r) => r.action === `prioritize:${e.number}` || r.action === `deprioritize:${e.number}`)
  if (pending) return <span className="w-28 text-right text-xs text-muted-foreground">applying…</span>
  if (finished(e) && !e.priority) return <span className="w-28" />
  return (
    <span className="w-28 text-right text-xs">
      {e.priority ? (
        <span className="inline-flex items-center gap-1.5">
          <Badge className="bg-primary/15 text-primary"><ArrowUpToLine />next</Badge>
          <button type="button" className="text-muted-foreground hover:text-primary hover:underline" onClick={() => m.mutate(`deprioritize:${e.number}`)}>undo</button>
        </span>
      ) : (
        <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary" onClick={() => m.mutate(`prioritize:${e.number}`)}
          title="Its startable sub-issues run before the others">
          <ArrowUpToLine className="size-3.5" />Run next
        </button>
      )}
    </span>
  )
}
