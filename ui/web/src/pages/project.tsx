import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  Activity, CircleCheck, CircleUserRound, CircleX, ClipboardList, Clock, ExternalLink, GitPullRequest,
  HardDrive, HeartPulse, History, Inbox, ListOrdered, MessageCircleQuestion, OctagonAlert, PartyPopper, Radio, Rocket, Server, Workflow,
} from "lucide-react"
import { useState } from "react"
import { EmptyState, PhaseStepper, Stat } from "@/components/chrome"
import { ComponentLog, RunLog } from "@/components/logs"
import { Freshness, PauseControl, PipelineBadge, StateBadge } from "@/components/status"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSidebar } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, queryKeys, type Component, type Project, type QueueItem } from "@/lib/api"
import { ago, dateTime, duration, usd } from "@/lib/format"
import { currentPhaseLabel } from "@/lib/phases"
import { cn } from "@/lib/utils"

export type ProjectTab = "now" | "queue" | "attention" | "history" | "health"

export function ProjectPage({ slug, tab }: { slug: string; tab: ProjectTab }) {
  const navigate = useNavigate()
  const { isMobile, state } = useSidebar()
  const showTabs = isMobile || state === "collapsed" // otherwise the sidebar lists the sections
  const q = useQuery({ queryKey: queryKeys.project(slug), queryFn: () => api.project(slug), refetchInterval: 10_000 })
  if (q.isPending) return <div className="grid gap-4"><Skeleton className="h-24" /><Skeleton className="h-80" /></div>
  if (q.isError) return <p className="text-destructive">{q.error.message}</p>
  const p = q.data
  const s = p.snapshot
  const reviews = s?.pullRequests.filter((pr) => pr.labels.includes("adlc:needs-human-review")) ?? []
  const needYou = (s?.attention.length ?? 0) + reviews.length
  const run = p.active[0]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">{p.slug}<PipelineBadge paused={p.paused} backoffUntil={p.backoffUntil} /></h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <a href={`https://github.com/${p.repo}`} target="_blank" rel="noreferrer" className="hover:text-foreground">{p.repo}</a>
            {" · "}GitHub data {ago(s?.generatedAt)}{p.devDeployed ? <> · dev runs <span className="font-mono">{p.devDeployed}</span></> : null}
          </p>
        </div>
        <PauseControl slug={p.slug} paused={p.paused} pending={p.pending} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Workflow} label="Running" tone={run ? "primary" : "default"} value={run ? `#${run.issue}` : "idle"}
          hint={run ? currentPhaseLabel(run.progress) : `${s?.counts.ready ?? 0} ready`} />
        <Stat icon={ListOrdered} label="Queued" value={s?.counts.queued ?? 0} hint={`${s?.counts["pr-open"] ?? 0} with an open PR`} />
        <Stat icon={Inbox} label="Needs you" tone={needYou ? "warn" : "ok"} value={needYou} hint={`${reviews.length} PRs · ${s?.attention.length ?? 0} issues`} />
        <Stat icon={CircleUserRound} label="Your tasks" tone={s?.counts.owner ? "warn" : "default"} value={s?.counts.owner ?? 0} hint="owner tasks open" />
      </div>

      <Tabs key={tab} className="min-w-0" value={tab} onValueChange={(v) => navigate({ to: "/p/$slug", params: { slug }, search: { tab: v as ProjectTab } })}>
        <TabsList className={cn("max-w-full justify-start overflow-x-auto", !showTabs && "hidden")}>
          <TabsTrigger value="now"><Radio />Now{p.active.length ? ` (${p.active.length})` : ""}</TabsTrigger>
          <TabsTrigger value="queue"><ListOrdered />Queue</TabsTrigger>
          <TabsTrigger value="attention"><Inbox />Needs you{needYou ? ` (${needYou})` : ""}</TabsTrigger>
          <TabsTrigger value="history"><History />History</TabsTrigger>
          <TabsTrigger value="health"><HeartPulse />Health</TabsTrigger>
        </TabsList>
        <TabsContent value="now" className="mt-2"><NowTab p={p} /></TabsContent>
        <TabsContent value="queue" className="mt-2"><QueueTab items={s?.queue ?? []} /></TabsContent>
        <TabsContent value="attention" className="mt-2"><AttentionTab p={p} /></TabsContent>
        <TabsContent value="history" className="mt-2"><HistoryTab slug={slug} /></TabsContent>
        <TabsContent value="health" className="mt-2"><HealthTab p={p} /></TabsContent>
      </Tabs>
    </div>
  )
}

function IssueLink({ item, className }: { item: Pick<QueueItem, "number" | "title" | "url">; className?: string }) {
  return (
    <a href={item.url} target="_blank" rel="noreferrer" className={cn("hover:text-primary", className)}>
      <span className="font-mono text-muted-foreground">#{item.number}</span> {item.title}
    </a>
  )
}

function NowTab({ p }: { p: Project }) {
  const [selected, setSelected] = useState(0)
  if (!p.active.length) {
    const next = p.snapshot?.queue.find((i) => i.state === "ready")
    return (
      <EmptyState icon={Rocket} title={p.paused ? "The pipeline is paused" : "No delivery run is active"}>
        {next ? <>Next up: <IssueLink item={next} />{p.paused ? ", once you resume." : "."}</> : "Nothing is ready to start: everything is waiting for blockers or for you."}
      </EmptyState>
    )
  }
  const a = p.active[Math.min(selected, p.active.length - 1)]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {p.active.length > 1 && (
        <div className="flex gap-2">{p.active.map((x, i) => (
          <button key={x.issue} onClick={() => setSelected(i)}
            className={cn("rounded-full px-3 py-1 text-sm", i === selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>#{x.issue}</button>
        ))}</div>
      )}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-lg"><span className="font-mono text-muted-foreground">#{a.issue}</span> {a.title}</CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {a.run && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />started {ago(a.run.started)}</span>}
                {a.run && <span className="inline-flex items-center gap-1"><Activity className="size-3.5" />last output {ago(a.run.updated)}</span>}
                {a.progress?.tasks ? <span>{a.progress.tasks} tasks</span> : null}
                {a.run && <Link to="/p/$slug/runs/$file" params={{ slug: p.slug, file: a.run.file }} className="text-primary hover:underline">open full log</Link>}
              </CardDescription>
            </div>
            {a.progress?.risk && <RiskBadge risk={a.progress.risk} />}
          </div>
          <PhaseStepper progress={a.progress} />
        </CardHeader>
        <CardContent>{a.run ? <RunLog slug={p.slug} file={a.run.file} /> : <p className="text-muted-foreground">Waiting for the first output…</p>}</CardContent>
      </Card>
    </div>
  )
}

function RiskBadge({ risk }: { risk: string }) {
  const tone = risk === "high" ? "border-red-500/40 text-red-600 dark:text-red-400" : risk === "medium" ? "border-amber-500/40 text-amber-600 dark:text-amber-400" : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
  return <Badge variant="outline" className={tone}>{risk} risk</Badge>
}

function QueueTab({ items }: { items: QueueItem[] }) {
  if (!items.length) return <EmptyState icon={ListOrdered} title="No queue data yet">The runner writes it within a minute.</EmptyState>
  const groups: { milestone: string; items: QueueItem[] }[] = []
  for (const i of items) {
    const last = groups.at(-1)
    if (last && last.milestone === i.milestone) last.items.push(i)
    else groups.push({ milestone: i.milestone, items: [i] })
  }
  return (
    <div className="grid gap-4">
      {groups.map((g, gi) => (
        <Card key={`${g.milestone}-${gi}`} className="gap-0 py-0">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h3 className="text-sm font-semibold">{g.milestone || "No milestone"}</h3>
            <span className="text-xs text-muted-foreground">{g.items.length} issues</span>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-12 pl-4">Order</TableHead><TableHead>Issue</TableHead><TableHead className="w-32">State</TableHead>
              <TableHead className="hidden w-56 md:table-cell">Waiting for</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {g.items.map((i) => (
                <TableRow key={i.number} data-testid={`queue-${i.number}`} className={cn(i.state === "owner" && "bg-amber-500/5 hover:bg-amber-500/10")}>
                  <TableCell className="pl-4 font-mono text-xs text-muted-foreground">{i.rank}</TableCell>
                  <TableCell className="max-w-[34rem] whitespace-normal">
                    <IssueLink item={i} />
                    {i.state === "owner" && i.unblocks ? <span className="ml-1.5 text-xs text-muted-foreground">unblocks {i.unblocks}</span> : null}
                  </TableCell>
                  <TableCell><StateBadge state={i.state} /></TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {i.blockers.slice(0, 4).map((b) => (
                        <Badge key={b.number} variant={b.owner ? "default" : "secondary"} className={cn("font-mono", b.owner && "bg-amber-500 text-black")}>#{b.number}{b.owner ? " you" : ""}</Badge>
                      ))}
                      {i.blockers.length > 4 && <span className="text-xs text-muted-foreground">+{i.blockers.length - 4}</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  )
}

function AttentionTab({ p }: { p: Project }) {
  const s = p.snapshot
  if (!s) return <EmptyState icon={Inbox} title="No data yet">The runner writes it within a minute.</EmptyState>
  const reviews = s.pullRequests.filter((pr) => pr.labels.includes("adlc:needs-human-review"))
  const owner = s.queue.filter((i) => i.state === "owner").slice(0, 6)
  if (!reviews.length && !s.attention.length && !owner.length) {
    return <EmptyState icon={PartyPopper} title="Nothing needs you right now">The agents have everything they need.</EmptyState>
  }
  return (
    <div className="grid gap-6">
      <Section icon={GitPullRequest} title="Pull requests to review" count={reviews.length} empty="No PR is waiting for you.">
        {reviews.map((pr) => (
          <a key={pr.number} href={pr.url} target="_blank" rel="noreferrer"
            className="group flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
            <div className="min-w-0">
              <p className="font-medium group-hover:text-primary"><span className="font-mono text-muted-foreground">PR #{pr.number}</span> {pr.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pr.closes.length ? `closes #${pr.closes.join(", #")} · ` : ""}opened {ago(pr.createdAt)} · {pr.mergeState.toLowerCase().replace("_", " ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {pr.labels.filter((l) => l.startsWith("adlc:risk-")).map((l) => <RiskBadge key={l} risk={l.replace("adlc:risk-", "")} />)}
              <ChecksBadge state={pr.checks} />
              <ExternalLink className="size-4 text-muted-foreground" />
            </div>
          </a>
        ))}
      </Section>
      <Section icon={OctagonAlert} title="Blocked runs and questions" count={s.attention.length} empty="Nothing is blocked or waiting for an answer.">
        {s.attention.map((a) => (
          <div key={a.number} className={cn("rounded-xl border bg-card p-4", a.state === "blocked" && "border-red-500/40")}>
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge state={a.state} />
              <IssueLink item={a} className="font-medium" />
            </div>
            {a.lastComment ? (
              <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
                <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MessageCircleQuestion className="size-3.5" />{a.lastComment.author} · {ago(a.lastComment.at)}</p>
                <p className="line-clamp-6 whitespace-pre-wrap">{a.lastComment.body}</p>
              </div>
            ) : <p className="mt-2 text-sm text-muted-foreground">The question is in the issue description.</p>}
          </div>
        ))}
      </Section>
      <Section icon={ClipboardList} title="Your next tasks" count={owner.length} empty="No open owner tasks.">
        <div className="grid gap-2 sm:grid-cols-2">
          {owner.map((o) => (
            <div key={o.number} className="rounded-xl border bg-card p-3 text-sm">
              <IssueLink item={o} />
              <p className="mt-1 text-xs text-muted-foreground">{o.milestone.split(" ")[0]}{o.unblocks ? ` · unblocks ${o.unblocks}` : ""}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

function ChecksBadge({ state }: { state: string | null }) {
  if (!state) return null
  const ok = state === "SUCCESS", bad = state === "FAILURE" || state === "ERROR"
  return (
    <Badge variant="outline" className={cn(ok && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400", bad && "border-red-500/40 text-red-600")}>
      {ok ? <CircleCheck /> : bad ? <CircleX /> : <Clock />}checks {state.toLowerCase()}
    </Badge>
  )
}

function Section({ icon: Icon, title, count, empty, children }: { icon: typeof Inbox; title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="flex items-center gap-2 font-semibold"><Icon className="size-4 text-primary" />{title}{count ? <Badge variant="secondary">{count}</Badge> : null}</h2>
      {count ? children : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  )
}

function HistoryTab({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: queryKeys.runs(slug), queryFn: () => api.runs(slug), refetchInterval: 30_000 })
  if (q.isPending) return <Skeleton className="h-40 w-full" />
  if (q.isError) return <p className="text-destructive">{q.error.message}</p>
  if (!q.data.length) return <EmptyState icon={History} title="No delivery runs yet" />
  const finished = q.data.filter((r) => r.result)
  const ok = finished.filter((r) => r.result?.outcome === "success" && !r.result.error).length
  const cost = finished.reduce((n, r) => n + (r.result?.costUsd ?? 0), 0)
  const time = finished.reduce((n, r) => n + (r.result?.durationMs ?? 0), 0)
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={History} label="Runs" value={q.data.length} hint={`${q.data.length - finished.length} running or interrupted`} />
        <Stat icon={CircleCheck} label="Succeeded" tone="ok" value={finished.length ? `${Math.round((ok / finished.length) * 100)}%` : "–"} hint={`${ok} of ${finished.length} finished`} />
        <Stat icon={Clock} label="Agent time" value={duration(time)} hint={finished.length ? `${duration(time / finished.length)} per run` : undefined} />
        <Stat icon={Rocket} label="API-equiv. cost" value={usd(cost)} hint="not billed on a subscription" />
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="pl-4">Issue</TableHead><TableHead>Started</TableHead><TableHead>Result</TableHead>
            <TableHead className="text-right">Duration</TableHead><TableHead className="pr-4 text-right">Cost</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {q.data.map((r) => {
              const good = r.result?.outcome === "success" && !r.result.error
              return (
                <TableRow key={r.file}>
                  <TableCell className="pl-4"><Link to="/p/$slug/runs/$file" params={{ slug, file: r.file }} className="font-mono text-primary hover:underline">#{r.issue}</Link></TableCell>
                  <TableCell className="text-muted-foreground">{dateTime(r.started)}</TableCell>
                  <TableCell>
                    {r.result
                      ? <span className={cn("inline-flex items-center gap-1.5", good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600")}>{good ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}{r.result.outcome}</span>
                      : <span className="text-muted-foreground">running or interrupted</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{duration(r.result?.durationMs)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{usd(r.result?.costUsd)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

const COMPONENTS: { id: Component; name: string; what: string; staleAfterMin: number }[] = [
  { id: "poller", name: "Poller", what: "starts runs, promotes the queue", staleAfterMin: 15 },
  { id: "deployer", name: "Dev deployer", what: "deploys main to the dev environment", staleAfterMin: 24 * 60 },
  { id: "rc", name: "Remote Control", what: "your sessions from the Claude app", staleAfterMin: 24 * 60 },
]

function DiskCard({ dockerUsage }: { dockerUsage: Project["dockerUsage"] }) {
  const q = useQuery({ queryKey: queryKeys.disk, queryFn: api.disk, refetchInterval: 60_000 })
  const d = q.data
  if (!d) return null
  const usedPct = Math.round(((d.totalGb - d.freeGb) / d.totalGb) * 100)
  const low = d.freeGb < d.minFreeGb, warn = d.freeGb < d.minFreeGb * 2 || usedPct >= d.warnPct
  return (
    <div className={cn("grid gap-2 rounded-xl border bg-card p-4", low && "border-red-500/50")} data-testid="disk-card">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium"><HardDrive className="size-4 text-primary" />Dev server disk</span>
        <span className={cn("text-sm tabular-nums", low ? "text-red-600" : warn ? "text-amber-600" : "text-muted-foreground")}>{d.freeGb} GB free of {d.totalGb} GB</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", low ? "bg-red-500" : warn ? "bg-amber-500" : "bg-primary")} style={{ width: `${usedPct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {low ? <>Below {d.minFreeGb} GB no new runs start. On the dev server: <code>adlc prune</code>.</>
          : warn ? <>{usedPct}% used, above the {d.warnPct}% warning level. On the dev server: <code>adlc status</code> shows what uses it, <code>adlc prune</code> frees it.</>
          : <>Housekeeping runs every few hours; below {d.minFreeGb} GB new runs wait.</>}
      </p>
      {dockerUsage && (
        <p className="text-xs text-muted-foreground" data-testid="docker-usage">
          <span className="font-medium text-foreground">Agents' Docker:</span> {dockerUsage.text}{" "}
          <span className="whitespace-nowrap">(<Freshness iso={dockerUsage.updated} staleAfterMin={12 * 60} />)</span>
        </p>
      )}
    </div>
  )
}

function HealthTab({ p }: { p: Project }) {
  const [log, setLog] = useState<Component>("poller")
  return (
    <div className="grid gap-4">
      <DiskCard dockerUsage={p.dockerUsage} />
      <div className="grid gap-3 md:grid-cols-3">
        {COMPONENTS.map((c) => (
          <button key={c.id} type="button" onClick={() => setLog(c.id)}
            className={cn("grid gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40", log === c.id && "border-primary ring-2 ring-primary/15")}>
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium"><Server className="size-4 text-primary" />{c.name}</span>
              <Freshness iso={p.health[c.id].updated} staleAfterMin={c.staleAfterMin} />
            </span>
            <span className="text-xs text-muted-foreground">{c.what}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">{p.health[c.id].last || "no log yet"}</span>
          </button>
        ))}
      </div>
      {!p.loggedIn && <p className="text-sm text-amber-600">Remote Control isn't logged in: run <code>adlc login {p.slug}</code> on the dev server.</p>}
      <Card>
        <CardHeader><CardTitle>{COMPONENTS.find((c) => c.id === log)?.name} log</CardTitle></CardHeader>
        <CardContent><ComponentLog key={log} slug={p.slug} component={log} /></CardContent>
      </Card>
    </div>
  )
}
