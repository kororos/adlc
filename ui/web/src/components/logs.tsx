import { Bot, CircleCheck, CircleX, Terminal, Wrench } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { Component, RunEvent } from "@/lib/api"
import { duration, usd } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useEventStream } from "@/lib/use-event-stream"

// Keeps a scroll container pinned to the bottom unless the reader has scrolled up.
function useStickToBottom<T>(deps: T) {
  const ref = useRef<HTMLDivElement>(null)
  const stuck = useRef(true)
  useEffect(() => {
    const el = ref.current
    if (el && stuck.current) el.scrollTop = el.scrollHeight
  }, [deps])
  const onScroll = () => {
    const el = ref.current
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }
  return { ref, onScroll }
}

function LiveDot({ status }: { status: "connecting" | "live" | "closed" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-2 rounded-full", status === "live" ? "animate-pulse bg-emerald-500" : "bg-muted-foreground")} />
      {status === "live" ? "live" : status}
    </span>
  )
}

export function RunLog({ slug, file }: { slug: string; file: string }) {
  const [sub, setSub] = useState(false)
  const url = `/api/projects/${slug}/runs/${file}/events${sub ? "?subagents=1" : ""}`
  const { items, status } = useEventStream<RunEvent>(url, "events")
  const { ref, onScroll } = useStickToBottom(items.length)
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <LiveDot status={status} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} /> include subagents' steps
        </label>
      </div>
      <div ref={ref} onScroll={onScroll} data-testid="run-log"
        className="h-[65vh] overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-[13px] leading-relaxed">
        {items.length === 0 && <p className="text-muted-foreground">{status === "live" ? "Nothing logged yet." : "Connecting…"}</p>}
        {items.map((e, i) => <RunEventRow key={i} e={e} />)}
      </div>
    </div>
  )
}

function RunEventRow({ e }: { e: RunEvent }) {
  const indent = e.sub ? "ml-6 border-l pl-3 opacity-80" : ""
  if (e.kind === "start") return <p className={cn("text-muted-foreground", indent)}>— {e.sub ? "subagent" : "run"} started{e.model ? ` (${e.model})` : ""}</p>
  if (e.kind === "text") return <p className={cn("my-1.5 whitespace-pre-wrap font-sans text-sm", indent)}><Bot className="mr-1.5 inline size-4 align-[-2px]" />{e.text}</p>
  if (e.kind === "tool") {
    const Icon = e.tool === "Bash" ? Terminal : Wrench
    return <p className={cn("truncate text-muted-foreground", indent)} title={e.summary}><Icon className="mr-1.5 inline size-3.5 align-[-2px]" />{e.tool}{e.summary ? ` · ${e.summary}` : ""}</p>
  }
  const ok = e.outcome === "success" && !e.error
  return (
    <div className={cn("my-2 rounded border p-2 font-sans text-sm", ok ? "border-emerald-600/50" : "border-red-600/50", indent)}>
      <p className="font-medium">
        {ok ? <CircleCheck className="mr-1.5 inline size-4 text-emerald-600" /> : <CircleX className="mr-1.5 inline size-4 text-red-600" />}
        {e.sub ? "subagent finished" : "run finished"}: {e.outcome} · {duration(e.durationMs)} · {usd(e.costUsd)}{e.turns != null ? ` · ${e.turns} turns` : ""}
      </p>
      {e.text && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{e.text}</p>}
    </div>
  )
}

export function ComponentLog({ slug, component }: { slug: string; component: Component }) {
  const { items, status } = useEventStream<string>(`/api/projects/${slug}/logs/${component}`, "lines", 2000)
  const { ref, onScroll } = useStickToBottom(items.length)
  return (
    <div className="grid gap-2">
      <LiveDot status={status} />
      <div ref={ref} onScroll={onScroll} className="h-[55vh] overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
        {items.map((l, i) => <div key={i} className="whitespace-pre-wrap break-all">{l}</div>)}
        {items.length === 0 && <p className="text-muted-foreground">No log lines yet.</p>}
      </div>
    </div>
  )
}
