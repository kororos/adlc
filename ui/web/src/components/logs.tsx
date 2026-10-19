import { Bot, CircleCheck, CircleX, FilePen, FileSearch, ListTodo, Sparkles, Terminal, Users, Wrench } from "lucide-react"
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
        className="h-[65vh] overflow-y-auto rounded-xl border bg-muted/40 p-4 text-[13px] leading-relaxed">
        {items.length === 0 && <p className="text-muted-foreground">{status === "live" ? "Nothing logged yet." : "Connecting…"}</p>}
        {items.map((e, i) => <RunEventRow key={i} e={e} />)}
      </div>
    </div>
  )
}

const TOOL_ICON: Record<string, typeof Wrench> = {
  Bash: Terminal, Edit: FilePen, Write: FilePen, NotebookEdit: FilePen,
  Read: FileSearch, Grep: FileSearch, Glob: FileSearch, Skill: Sparkles, TodoWrite: ListTodo, Agent: Users, Task: Users,
}

function RunEventRow({ e }: { e: RunEvent }) {
  const indent = e.sub ? "ml-5 border-l-2 border-primary/15 pl-3" : ""
  if (e.kind === "start") {
    return <p className={cn("my-1 text-xs tracking-wide text-muted-foreground uppercase", indent)}>{e.sub ? "subagent" : "run"} started{e.model ? ` · ${e.model}` : ""}</p>
  }
  if (e.kind === "text") {
    return (
      <div className={cn("my-2 flex gap-2.5", indent)}>
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-primary"><Bot className="size-3.5" /></span>
        <p className="min-w-0 text-sm whitespace-pre-wrap">{e.text}</p>
      </div>
    )
  }
  if (e.kind === "tool") {
    const Icon = TOOL_ICON[e.tool] ?? Wrench
    if (e.tool === "Agent" || e.tool === "Task") {
      const [who, ...what] = e.summary.split(": ")
      return (
        <div className={cn("my-2 ml-8 flex flex-wrap items-center gap-2", indent)}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"><Icon className="size-3.5" />{who.replace("adlc-core:", "")}</span>
          <span className="text-sm text-muted-foreground">{what.join(": ")}</span>
        </div>
      )
    }
    return (
      <p className={cn("ml-8 flex items-center gap-1.5 truncate font-mono text-xs text-muted-foreground", indent)} title={e.summary}>
        <Icon className="size-3.5 shrink-0" /><span className="font-medium text-foreground/70">{e.tool}</span>{e.summary ? <span className="truncate">{e.summary}</span> : null}
      </p>
    )
  }
  const ok = e.outcome === "success" && !e.error
  return (
    <div className={cn("my-3 rounded-xl border p-3 text-sm", ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5", indent)}>
      <p className="flex flex-wrap items-center gap-x-2 font-medium">
        {ok ? <CircleCheck className="size-4 text-emerald-600" /> : <CircleX className="size-4 text-red-600" />}
        {e.sub ? "Subagent finished" : "Run finished"}: {e.outcome}
        <span className="font-normal text-muted-foreground">· {duration(e.durationMs)} · {usd(e.costUsd)}{e.turns != null ? ` · ${e.turns} turns` : ""}</span>
      </p>
      {e.text && <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">{e.text}</p>}
    </div>
  )
}

export function ComponentLog({ slug, component }: { slug: string; component: Component }) {
  const { items, status } = useEventStream<string>(`/api/projects/${slug}/logs/${component}`, "lines", 2000)
  const { ref, onScroll } = useStickToBottom(items.length)
  return (
    <div className="grid gap-2">
      <LiveDot status={status} />
      <div ref={ref} onScroll={onScroll} className="h-[55vh] overflow-y-auto rounded-xl border bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200">
        {items.map((l, i) => <div key={i} className="whitespace-pre-wrap break-all">{l}</div>)}
        {items.length === 0 && <p className="text-zinc-400">No log lines yet.</p>}
      </div>
    </div>
  )
}
