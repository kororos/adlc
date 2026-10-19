import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ExternalLink } from "lucide-react"
import { useState } from "react"
import { ComponentLog, RunLog } from "@/components/logs"
import { Freshness, PauseControl, PipelineBadge, StateBadge } from "@/components/status"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, queryKeys, type Component, type Project, type QueueItem } from "@/lib/api"
import { ago, dateTime, duration, usd } from "@/lib/format"

export type ProjectTab = "now" | "queue" | "attention" | "history" | "health"

export function ProjectPage({ slug, tab }: { slug: string; tab: ProjectTab }) {
  const navigate = useNavigate()
  const q = useQuery({ queryKey: queryKeys.project(slug), queryFn: () => api.project(slug), refetchInterval: 10_000 })
  if (q.isPending) return <Skeleton className="h-60 w-full" />
  if (q.isError) return <p className="text-destructive">{q.error.message}</p>
  const p = q.data
  const reviews = p.snapshot?.pullRequests.filter((pr) => pr.labels.includes("adlc:needs-human-review")) ?? []
  const needYou = (p.snapshot?.attention.length ?? 0) + reviews.length
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{p.slug}</h1>
          <p className="text-sm text-muted-foreground">
            <a href={`https://github.com/${p.repo}`} target="_blank" rel="noreferrer" className="hover:underline">{p.repo}</a>
            {" · "}GitHub data {ago(p.snapshot?.generatedAt)}{p.devDeployed ? ` · dev: ${p.devDeployed}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PipelineBadge paused={p.paused} backoffUntil={p.backoffUntil} />
          <PauseControl slug={p.slug} paused={p.paused} pending={p.pending} />
        </div>
      </div>
      <Tabs value={tab} onValueChange={(v) => navigate({ to: "/p/$slug", params: { slug }, search: { tab: v as ProjectTab } })}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="now">Now{p.active.length ? ` (${p.active.length})` : ""}</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="attention">Needs you{needYou ? ` (${needYou})` : ""}</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
        </TabsList>
        <TabsContent value="now"><NowTab p={p} /></TabsContent>
        <TabsContent value="queue"><QueueTab items={p.snapshot?.queue ?? []} /></TabsContent>
        <TabsContent value="attention"><AttentionTab p={p} /></TabsContent>
        <TabsContent value="history"><HistoryTab slug={slug} /></TabsContent>
        <TabsContent value="health"><HealthTab p={p} /></TabsContent>
      </Tabs>
    </div>
  )
}

function NowTab({ p }: { p: Project }) {
  const [selected, setSelected] = useState(0)
  if (!p.active.length) {
    const next = p.snapshot?.queue.find((i) => i.state === "ready")
    return (
      <Card><CardContent className="py-6 text-muted-foreground">
        No delivery run is active.{next ? <> Next up: <IssueLink item={next} />{p.paused ? " (when resumed)" : ""}.</> : null}
      </CardContent></Card>
    )
  }
  const a = p.active[Math.min(selected, p.active.length - 1)]
  return (
    <div className="grid gap-3">
      {p.active.length > 1 && (
        <div className="flex gap-2">{p.active.map((x, i) => (
          <button key={x.issue} onClick={() => setSelected(i)} className={i === selected ? "font-semibold underline" : "text-muted-foreground"}>#{x.issue}</button>
        ))}</div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>#{a.issue} {a.title}</CardTitle>
          <CardDescription>
            {a.run ? <>started {ago(a.run.started)} · last output {ago(a.run.updated)} · <Link to="/p/$slug/runs/$file" params={{ slug: p.slug, file: a.run.file }} className="underline">full page</Link></> : "starting…"}
          </CardDescription>
        </CardHeader>
        <CardContent>{a.run ? <RunLog slug={p.slug} file={a.run.file} /> : <p className="text-muted-foreground">Waiting for the first output…</p>}</CardContent>
      </Card>
    </div>
  )
}

function IssueLink({ item }: { item: Pick<QueueItem, "number" | "title" | "url"> }) {
  return <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">#{item.number} {item.title}</a>
}

function QueueTab({ items }: { items: QueueItem[] }) {
  if (!items.length) return <p className="text-muted-foreground">No snapshot yet: the runner writes it within a minute.</p>
  return (
    <Card><CardContent className="px-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead className="w-10">#</TableHead><TableHead>Issue</TableHead><TableHead>State</TableHead>
          <TableHead className="hidden md:table-cell">Milestone</TableHead><TableHead className="hidden md:table-cell">Waiting for</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.number} data-testid={`queue-${i.number}`}>
              <TableCell className="text-muted-foreground">{i.rank}</TableCell>
              <TableCell className="max-w-[28rem] whitespace-normal"><IssueLink item={i} />{i.state === "owner" && i.unblocks ? <span className="text-muted-foreground"> · unblocks {i.unblocks}</span> : null}</TableCell>
              <TableCell><StateBadge state={i.state} /></TableCell>
              <TableCell className="hidden md:table-cell text-muted-foreground">{i.milestone.split(" ")[0] || "–"}</TableCell>
              <TableCell className="hidden md:table-cell">
                {i.blockers.slice(0, 5).map((b) => <Badge key={b.number} variant={b.owner ? "default" : "secondary"} className="mr-1">#{b.number}{b.owner ? " you" : ""}</Badge>)}
                {i.blockers.length > 5 && <span className="text-muted-foreground">+{i.blockers.length - 5}</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  )
}

function AttentionTab({ p }: { p: Project }) {
  const s = p.snapshot
  if (!s) return <p className="text-muted-foreground">No snapshot yet.</p>
  const reviews = s.pullRequests.filter((pr) => pr.labels.includes("adlc:needs-human-review"))
  const owner = s.queue.filter((i) => i.state === "owner").slice(0, 5)
  return (
    <div className="grid gap-4">
      <Section title="Pull requests waiting for your review" empty="No PR is waiting for you.">
        {reviews.map((pr) => (
          <Alert key={pr.number}>
            <AlertTitle><a href={pr.url} target="_blank" rel="noreferrer" className="hover:underline">PR #{pr.number} {pr.title}</a> <ExternalLink className="inline size-3.5" /></AlertTitle>
            <AlertDescription>
              {pr.labels.filter((l) => l.startsWith("adlc:risk-")).map((l) => l.replace("adlc:risk-", "")).join("")} risk · checks {pr.checks?.toLowerCase() ?? "–"} · {pr.mergeState.toLowerCase()}{pr.closes.length ? ` · closes #${pr.closes.join(", #")}` : ""} · opened {ago(pr.createdAt)}
            </AlertDescription>
          </Alert>
        ))}
      </Section>
      <Section title="Blocked runs and questions" empty="Nothing is blocked or waiting for an answer.">
        {s.attention.map((a) => (
          <Alert key={a.number} variant={a.state === "blocked" ? "destructive" : "default"}>
            <AlertTitle className="flex items-center gap-2"><StateBadge state={a.state} /><IssueLink item={a} /></AlertTitle>
            {a.lastComment && <AlertDescription className="whitespace-pre-wrap">{a.lastComment.body}</AlertDescription>}
          </Alert>
        ))}
      </Section>
      <Section title="Your next tasks" empty="No open owner tasks.">
        <ul className="grid gap-1 text-sm">{owner.map((o) => <li key={o.number}><IssueLink item={o} />{o.unblocks ? <span className="text-muted-foreground"> · unblocks {o.unblocks}</span> : null}</li>)}</ul>
      </Section>
    </div>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className="grid gap-2">
      <h2 className="font-medium">{title}</h2>
      {has ? children : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  )
}

function HistoryTab({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: queryKeys.runs(slug), queryFn: () => api.runs(slug), refetchInterval: 30_000 })
  if (q.isPending) return <Skeleton className="h-40 w-full" />
  if (q.isError) return <p className="text-destructive">{q.error.message}</p>
  if (!q.data.length) return <p className="text-muted-foreground">No delivery runs yet.</p>
  return (
    <Card><CardContent className="px-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Issue</TableHead><TableHead>Started</TableHead><TableHead>Result</TableHead>
          <TableHead className="text-right">Duration</TableHead><TableHead className="text-right" title="What the run would cost at API prices; a Claude subscription isn't billed per run">API-equiv. cost</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {q.data.map((r) => (
            <TableRow key={r.file}>
              <TableCell><Link to="/p/$slug/runs/$file" params={{ slug, file: r.file }} className="hover:underline">#{r.issue}</Link></TableCell>
              <TableCell>{dateTime(r.started)}</TableCell>
              <TableCell>{r.result ? r.result.outcome : <span className="text-muted-foreground">running or interrupted</span>}</TableCell>
              <TableCell className="text-right">{duration(r.result?.durationMs)}</TableCell>
              <TableCell className="text-right">{usd(r.result?.costUsd)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  )
}

const COMPONENTS: { id: Component; name: string; staleAfterMin: number }[] = [
  { id: "poller", name: "Poller (starts runs)", staleAfterMin: 15 },
  { id: "deployer", name: "Dev deployer", staleAfterMin: 24 * 60 },
  { id: "rc", name: "Remote Control", staleAfterMin: 24 * 60 },
]

function HealthTab({ p }: { p: Project }) {
  const [log, setLog] = useState<Component>("poller")
  return (
    <div className="grid gap-4">
      <Card><CardContent className="grid gap-2">
        {COMPONENTS.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
            <button className="text-left font-medium hover:underline" onClick={() => setLog(c.id)}>{c.name}</button>
            <Freshness iso={p.health[c.id].updated} staleAfterMin={c.staleAfterMin} />
            <p className="w-full truncate font-mono text-xs text-muted-foreground">{p.health[c.id].last}</p>
          </div>
        ))}
        {!p.loggedIn && <p className="text-sm text-amber-600">Remote Control isn't logged in: run <code>adlc login {p.slug}</code>.</p>}
      </CardContent></Card>
      <Card>
        <CardHeader><CardTitle>{COMPONENTS.find((c) => c.id === log)?.name} log</CardTitle></CardHeader>
        <CardContent><ComponentLog key={log} slug={p.slug} component={log} /></CardContent>
      </Card>
    </div>
  )
}
