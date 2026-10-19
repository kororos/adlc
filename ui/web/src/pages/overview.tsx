import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowRight, CircleUserRound, FolderGit2, GitPullRequest, OctagonAlert, Workflow } from "lucide-react"
import { EmptyState, Stat } from "@/components/chrome"
import { PauseControl, PipelineBadge } from "@/components/status"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, queryKeys } from "@/lib/api"
import { ago } from "@/lib/format"
import { currentPhaseLabel } from "@/lib/phases"

export function OverviewPage() {
  const q = useQuery({ queryKey: queryKeys.projects, queryFn: api.projects, refetchInterval: 10_000 })
  if (q.isPending) return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>
  if (q.isError) return <p className="text-destructive">{q.error.message}</p>
  if (!q.data.length) return <EmptyState icon={FolderGit2} title="No projects yet">Create one on the dev server with <code>adlc up &lt;slug&gt; --repo owner/name</code>.</EmptyState>
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">Delivery pipelines on this dev server.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {q.data.map((p) => {
          const run = p.active[0]
          return (
            <Card key={p.slug} data-testid={`project-${p.slug}`} className="gap-4 transition-shadow hover:shadow-md hover:shadow-primary/5">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-lg">
                    <Link to="/p/$slug" params={{ slug: p.slug }} className="group inline-flex items-center gap-1.5 hover:text-primary">
                      {p.slug}<ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </CardTitle>
                  <CardDescription className="truncate">{p.repo} · updated {ago(p.snapshotAt)}</CardDescription>
                </div>
                <PipelineBadge paused={p.paused} backoffUntil={p.backoffUntil} />
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Stat icon={Workflow} label="Running" tone={run ? "primary" : "default"}
                    value={run ? `#${run.issue}` : "idle"} hint={run ? `${currentPhaseLabel(run.progress)} · ${run.title}` : `${p.counts?.ready ?? 0} ready to start`} />
                  <Stat icon={GitPullRequest} label="To review" tone={p.reviews ? "warn" : "default"} value={p.reviews} hint="pull requests" />
                  <Stat icon={OctagonAlert} label="Blocked" tone={p.attention ? "danger" : "default"} value={p.attention} hint="runs and questions" />
                  <Stat icon={CircleUserRound} label="Your tasks" tone={p.counts?.owner ? "warn" : "default"} value={p.counts?.owner ?? 0} hint={`${p.counts?.queued ?? 0} issues queued`} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <PauseControl slug={p.slug} paused={p.paused} pending={p.pending} />
                  <Link to="/p/$slug" params={{ slug: p.slug }} className="text-sm font-medium text-primary hover:underline">Open</Link>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
