import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CirclePause, CirclePlay, LoaderCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api, queryKeys, type QueueState } from "@/lib/api"
import { ago } from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

const STATE_STYLE: Record<QueueState, string> = {
  "in-progress": "bg-blue-600 text-white",
  "pr-open": "bg-violet-600 text-white",
  ready: "bg-emerald-600 text-white",
  queued: "bg-muted text-muted-foreground",
  owner: "bg-amber-500 text-black",
  "needs-info": "bg-yellow-400 text-black",
  blocked: "bg-red-600 text-white",
  "needs-human-review": "bg-orange-500 text-black",
}

const STATE_LABEL: Partial<Record<QueueState, string>> = { owner: "your task", "needs-human-review": "needs review" }

export function StateBadge({ state }: { state: QueueState }) {
  return <Badge className={cn("border-transparent", STATE_STYLE[state])}>{STATE_LABEL[state] ?? state}</Badge>
}

export function PauseControl({ slug, paused, pending }: { slug: string; paused: boolean; pending: { action: string; at: string }[] }) {
  const now = useNow(10_000)
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: (action: "pause" | "resume") => api.action(slug, action),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.projects })
      void qc.invalidateQueries({ queryKey: queryKeys.project(slug) })
    },
  })
  // Only pause/resume requests concern this button (the automation switches queue requests too).
  const mine = pending.filter((r) => r.action === "pause" || r.action === "resume")
  const waiting = mine.length > 0 || m.isPending
  const next = paused ? "resume" : "pause"
  // The poller applies requests within seconds; two minutes means it isn't seeing them.
  const stuck = mine.some((r) => now - new Date(r.at).getTime() > 120_000)
  return (
    <div className="flex items-center gap-2">
      <Button variant={paused ? "default" : "outline"} size="sm" disabled={waiting} onClick={() => m.mutate(next)}
        data-testid={`${next}-${slug}`}>
        {waiting ? <LoaderCircle className="animate-spin" /> : paused ? <CirclePlay /> : <CirclePause />}
        {waiting ? `${mine[0]?.action ?? next} requested…` : paused ? "Resume" : "Pause"}
      </Button>
      {stuck && (
        <span className="max-w-xs text-xs text-amber-600 dark:text-amber-400">
          The runner hasn't picked this up. Is it running and up to date? On the dev server: <code>adlc status {slug}</code>, then <code>adlc up {slug}</code>.
        </span>
      )}
      {m.isError && <span className="text-sm text-destructive">{(m.error as Error).message}</span>}
    </div>
  )
}

export function PipelineBadge({ paused, backoffUntil }: { paused: boolean; backoffUntil: string | null }) {
  if (paused) return <Badge variant="outline" className="border-amber-500 text-amber-600">paused</Badge>
  if (backoffUntil) return <Badge variant="outline" className="border-orange-500 text-orange-600">usage limit · resumes {ago(backoffUntil)}</Badge>
  return (
    <Badge variant="outline" className="gap-1.5 border-emerald-500/50 text-emerald-700 dark:text-emerald-400">
      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />active
    </Badge>
  )
}

// A component is "stale" when its log hasn't moved for a while (the poller logs at least every
// ten minutes while paused; idle deployers and Remote Control can be quiet much longer).
export function Freshness({ iso, staleAfterMin }: { iso: string | null; staleAfterMin: number }) {
  const now = useNow()
  const stale = !iso || now - new Date(iso).getTime() > staleAfterMin * 60_000
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", stale ? "text-amber-600" : "text-muted-foreground")}>
      <span className={cn("size-2 rounded-full", stale ? "bg-amber-500" : "bg-emerald-500")} />
      {ago(iso, now)}
    </span>
  )
}
