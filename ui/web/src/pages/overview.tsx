import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Activity, GitPullRequest, OctagonAlert } from "lucide-react"
import { PauseControl, PipelineBadge } from "@/components/status"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, queryKeys } from "@/lib/api"
import { ago } from "@/lib/format"

export function OverviewPage() {
  const q = useQuery({ queryKey: queryKeys.projects, queryFn: api.projects, refetchInterval: 10_000 })
  if (q.isPending) return <Skeleton className="h-40 w-full" />
  if (q.isError) return <p className="text-destructive">{q.error.message}</p>
  if (!q.data.length) return <p className="text-muted-foreground">No projects yet. Create one with <code>adlc up &lt;slug&gt;</code>.</p>
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {q.data.map((p) => (
        <Card key={p.slug} data-testid={`project-${p.slug}`}>
          <CardHeader>
            <CardTitle><Link to="/p/$slug" params={{ slug: p.slug }} className="hover:underline">{p.slug}</Link></CardTitle>
            <CardDescription>{p.repo} · GitHub data {ago(p.snapshotAt)}</CardDescription>
            <CardAction><PipelineBadge paused={p.paused} backoffUntil={p.backoffUntil} /></CardAction>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5"><Activity className="size-4" />{p.active.length ? p.active.map((a) => `#${a.issue}`).join(", ") : "no active run"}</span>
              <span className="inline-flex items-center gap-1.5"><GitPullRequest className="size-4" />{p.reviews} PR(s) to review</span>
              <span className="inline-flex items-center gap-1.5"><OctagonAlert className="size-4" />{p.attention} blocked / questions</span>
            </div>
            {p.counts && (
              <p className="text-sm text-muted-foreground">
                {(["ready", "queued", "owner", "pr-open"] as const).map((s) => `${p.counts?.[s] ?? 0} ${s === "owner" ? "your tasks" : s}`).join(" · ")}
              </p>
            )}
            <PauseControl slug={p.slug} paused={p.paused} pending={p.pending} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
