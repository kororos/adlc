import { useMutation, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, MoonStar, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, queryKeys, type Nightly, type Project } from "@/lib/api"
import { ago } from "@/lib/format"

function RunBadge({ last }: { last: NonNullable<Nightly["last"]> }) {
  if (last.status !== "completed") return <Badge variant="outline" className="border-sky-500 text-sky-600">running</Badge>
  if (last.conclusion === "success") return <Badge variant="outline" className="border-emerald-500 text-emerald-600">passed</Badge>
  return <Badge variant="outline" className="border-red-500 text-red-600">{last.conclusion || "failed"}</Badge>
}

// The project's nightly workflow (full e2e, Android, audit…): its latest run, and "Run now", which asks the
// runner to start it (applied within a minute). A failed nightly opens a regression issue, as on schedule.
export function NightlyCard({ p }: { p: Project }) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => api.action(p.slug, "run_nightly"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.project(p.slug) }),
  })
  const n = p.nightly
  if (!n) return null
  const pending = m.isPending || p.pending.some((r) => r.action === "run_nightly")
  const running = n.last?.status && n.last.status !== "completed"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MoonStar className="size-4 text-primary" />Nightly checks</CardTitle>
        <CardDescription>
          <code>{n.workflow}</code> on main: the exhaustive suites that don't run on every PR. A failure opens a regression issue.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0 text-sm">
          {n.last ? (
            <p className="flex flex-wrap items-center gap-2">
              <RunBadge last={n.last} />
              <span className="text-muted-foreground">
                {n.last.event === "schedule" ? "scheduled" : "started by hand"} {ago(n.last.createdAt)}
                {n.last.status === "completed" && <> · finished {ago(n.last.updatedAt)}</>}
              </span>
              <a href={n.last.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">open run</a>
            </p>
          ) : (
            <p className="text-muted-foreground">No run yet.</p>
          )}
          {n.trigger === "workflow_dispatch" && (
            <p className="mt-1 text-xs text-amber-600">
              The agents' token can't start this workflow directly (Actions is read-only). Add{" "}
              <code>repository_dispatch: {"{ types: [adlc-nightly] }"}</code> under <code>on:</code> in {n.workflow}.
            </p>
          )}
          {n.trigger === "none" && <p className="mt-1 text-xs text-muted-foreground">No manual trigger in {n.workflow} on main.</p>}
        </div>
        <Button size="sm" variant="outline" disabled={pending || !!running || n.trigger === "none"} onClick={() => m.mutate()}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
          {pending ? "Starting…" : running ? "Running" : "Run now"}
        </Button>
      </CardContent>
    </Card>
  )
}
