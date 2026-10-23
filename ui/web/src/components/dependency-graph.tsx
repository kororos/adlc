import { Minus, Network, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { EmptyState } from "@/components/chrome"
import { StateBadge } from "@/components/status"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { QueueItem, QueueState } from "@/lib/api"
import { cn } from "@/lib/utils"

// The open issues and their "blocked by" relationships as a left-to-right graph: an arrow goes from the
// blocking issue to the one it holds back, so work flows to the right. Groups of connected issues are laid
// out one under another (largest first); inside a group, an issue's column is the length of its longest
// chain of open blockers. No layout library: a small layered layout is enough for a backlog.

const W = 232, H = 58, GX = 56, GY = 14, PAD = 16, GROUP_GAP = 34

// SVG fills per state (same palette as the state badges).
const FILL: Record<QueueState, string> = {
  "in-progress": "fill-blue-600", "pr-open": "fill-violet-600", ready: "fill-emerald-600", queued: "fill-zinc-400",
  owner: "fill-amber-500", "needs-info": "fill-yellow-400", blocked: "fill-red-600", "needs-human-review": "fill-orange-500",
}
const ORDER: QueueState[] = ["in-progress", "pr-open", "ready", "queued", "blocked", "needs-human-review", "needs-info", "owner"]

type GNode = { id: number; item?: QueueItem; x: number; y: number }
type Layout = { nodes: GNode[]; edges: [number, number][]; width: number; height: number; isolated: number }

// keep: draw only these issues (and only the edges between them); otherwise every issue and its blockers.
function layout(items: QueueItem[], onlyLinked: boolean, keep: Set<number> | null): Layout {
  if (keep) items = items.filter((i) => keep.has(i.number))
  const byId = new Map(items.map((i) => [i.number, i]))
  const edges: [number, number][] = []
  for (const i of items) for (const b of i.blockers) if (!keep || keep.has(b.number)) edges.push([b.number, i.number])
  const preds = new Map<number, number[]>(), succs = new Map<number, number[]>()
  const ids = new Set<number>(items.map((i) => i.number))
  for (const [a, b] of edges) {
    ids.add(a) // a blocker outside the pipeline (e.g. an unlabelled issue) is drawn as a plain node
    if (!preds.has(b)) preds.set(b, [])
    if (!succs.has(a)) succs.set(a, [])
    preds.get(b)!.push(a)
    succs.get(a)!.push(b)
  }
  const linked = (id: number) => preds.has(id) || succs.has(id)
  const isolated = [...ids].filter((id) => !linked(id)).length
  const shown = [...ids].filter((id) => !onlyLinked || linked(id))

  // Weakly connected groups.
  const group = new Map<number, number>()
  const groups: number[][] = []
  for (const id of shown) {
    if (group.has(id)) continue
    const g: number[] = []
    const stack = [id]
    group.set(id, groups.length)
    while (stack.length) {
      const n = stack.pop()!
      g.push(n)
      for (const m of [...(preds.get(n) ?? []), ...(succs.get(n) ?? [])]) {
        if (!group.has(m)) { group.set(m, groups.length); stack.push(m) }
      }
    }
    groups.push(g)
  }
  groups.sort((a, b) => b.length - a.length || Math.min(...a) - Math.min(...b))

  // Column = longest chain of blockers (a cycle is cut where it's found).
  const col = new Map<number, number>()
  const visiting = new Set<number>()
  const column = (n: number): number => {
    if (col.has(n)) return col.get(n)!
    if (visiting.has(n)) return 0
    visiting.add(n)
    const c = Math.max(-1, ...(preds.get(n) ?? []).map(column)) + 1
    visiting.delete(n)
    col.set(n, c)
    return c
  }
  const rank = (n: number) => byId.get(n)?.rank ?? 0

  const nodes: GNode[] = []
  let top = PAD, width = 0
  for (const g of groups) {
    const cols: number[][] = []
    for (const n of g) (cols[column(n)] ??= []).push(n)
    cols.forEach((c) => c.sort((a, b) => rank(a) - rank(b) || a - b))
    // A few sweeps: order each column by the average position of its neighbours in the previous one.
    const pos = new Map<number, number>()
    const index = () => cols.forEach((c) => c?.forEach((n, i) => pos.set(n, i)))
    index()
    for (let sweep = 0; sweep < 4; sweep++) {
      const forward = sweep % 2 === 0
      const order = forward ? cols.map((_, i) => i).slice(1) : cols.map((_, i) => i).reverse().slice(1)
      for (const ci of order) {
        const c = cols[ci]
        if (!c) continue
        const near = (n: number) => (forward ? preds.get(n) : succs.get(n)) ?? []
        const score = (n: number) => { const ns = near(n).filter((m) => pos.has(m)); return ns.length ? ns.reduce((s, m) => s + pos.get(m)!, 0) / ns.length : pos.get(n)! }
        c.sort((a, b) => score(a) - score(b))
        c.forEach((n, i) => pos.set(n, i))
      }
    }
    const rows = Math.max(...cols.map((c) => c?.length ?? 0))
    cols.forEach((c, ci) => c?.forEach((n, i) => {
      // Centre short columns against the tallest one of the group.
      const offset = ((rows - c.length) * (H + GY)) / 2
      nodes.push({ id: n, item: byId.get(n), x: PAD + ci * (W + GX), y: top + offset + i * (H + GY) })
    }))
    width = Math.max(width, PAD * 2 + cols.length * (W + GX) - GX)
    top += rows * (H + GY) - GY + GROUP_GAP
  }
  const drawn = new Set(nodes.map((n) => n.id))
  return { nodes, edges: edges.filter(([a, b]) => drawn.has(a) && drawn.has(b)), width, height: Math.max(top - GROUP_GAP + PAD, 0), isolated }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// An issue's chain over the given edges: everything it waits for and (downstream) everything waiting for it;
// with downstream "direct", only the issues it blocks directly.
function chain(id: number, edges: [number, number][], downstream: "all" | "direct" = "all"): Set<number> {
  const s = new Set([id])
  if (downstream === "direct") for (const [a, b] of edges) if (a === id) s.add(b)
  for (const dir of downstream === "all" ? [0, 1] as const : [0] as const) {
    const stack = [id]
    while (stack.length) {
      const n = stack.pop()!
      for (const e of edges) if (e[1 - dir] === n && !s.has(e[dir])) { s.add(e[dir]); stack.push(e[dir]) }
    }
  }
  return s
}

export function DependencyGraph({ items }: { items: QueueItem[] }) {
  const [onlyLinked, setOnlyLinked] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [hover, setHover] = useState<number | null>(null)
  const [focus, setFocus] = useState<number | null>(null)
  const [milestone, setMilestone] = useState("")
  const milestones = useMemo(() => [...new Set(items.map((i) => i.milestone).filter(Boolean))], [items])
  // Focus (click on an issue): only its chain, across milestones. Otherwise the milestone filter.
  const keep = useMemo(() => {
    if (focus !== null) {
      const all: [number, number][] = items.flatMap((i) => i.blockers.map((b) => [b.number, i.number] as [number, number]))
      return chain(focus, all, "direct")
    }
    return milestone ? new Set(items.filter((i) => i.milestone === milestone).map((i) => i.number)) : null
  }, [focus, milestone, items])
  const g = useMemo(() => layout(items, onlyLinked && focus === null, keep), [items, onlyLinked, focus, keep])
  const at = useMemo(() => new Map(g.nodes.map((n) => [n.id, n])), [g])
  const lit = useMemo(() => (hover === null ? null : chain(hover, g.edges)), [hover, g.edges])

  if (!items.length) return <EmptyState icon={Network} title="No queue data yet">The runner writes it within a minute.</EmptyState>
  const states = ORDER.filter((s) => items.some((i) => i.state === s))

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Dependencies</span>
          <span className="flex items-center gap-1">
            <button type="button" className="rounded-md border p-1 hover:bg-muted" aria-label="zoom out" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}><Minus className="size-4" /></button>
            <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <button type="button" className="rounded-md border p-1 hover:bg-muted" aria-label="zoom in" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}><Plus className="size-4" /></button>
          </span>
        </CardTitle>
        <CardDescription>
          An arrow goes from an issue to the one it blocks; work flows left to right. Hover an issue to see its whole chain; click it to
          show only what it waits for (and what it blocks directly); click its number to open it on GitHub.
        </CardDescription>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {states.map((s) => <StateBadge key={s} state={s} />)}
          {focus !== null ? (
            <button type="button" className="ml-auto rounded-md border px-2 py-0.5 text-sm hover:bg-muted" onClick={() => setFocus(null)}>
              #{focus}: what it waits for · show all
            </button>
          ) : (
            <select className="ml-auto rounded-md border bg-card px-2 py-0.5 text-sm" value={milestone} onChange={(e) => setMilestone(e.target.value)} aria-label="milestone">
              <option value="">all milestones</option>
              {milestones.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <input type="checkbox" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} />
            only issues with dependencies{g.isolated ? ` (${g.isolated} without hidden)` : ""}
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {!g.nodes.length ? (
          <p className="text-sm text-muted-foreground">No open issue has an open dependency.</p>
        ) : (
          <div className="max-h-[75vh] overflow-auto rounded-lg border bg-muted/20">
            <svg width={g.width * zoom} height={g.height * zoom} viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-label="issue dependency graph">
              <defs>
                <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" />
                </marker>
              </defs>
              {g.edges.map(([a, b]) => {
                const p = at.get(a)!, q = at.get(b)!
                const x1 = p.x + W, y1 = p.y + H / 2, x2 = q.x - 2, y2 = q.y + H / 2, mx = (x1 + x2) / 2
                const on = !lit || (lit.has(a) && lit.has(b))
                return <path key={`${a}-${b}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" markerEnd="url(#dep-arrow)"
                  className={cn("stroke-muted-foreground transition-opacity", on ? "opacity-70" : "opacity-10")} strokeWidth={on && lit ? 2 : 1.25} />
              })}
              {g.nodes.map((n) => {
                const i = n.item
                const on = !lit || lit.has(n.id)
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`} className={cn("cursor-pointer transition-opacity", on ? "opacity-100" : "opacity-25")}
                    onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                    onClick={() => { setFocus(n.id === focus ? null : n.id); setHover(null) }}>
                    <title>{i ? `#${i.number} ${i.title}\n${i.state}${i.milestone ? ` · ${i.milestone}` : ""}` : `#${n.id} (not in the pipeline)`}</title>
                    <rect width={W} height={H} rx={8} className={cn("fill-card stroke-border", hover === n.id && "stroke-primary")} strokeWidth={hover === n.id ? 2 : 1} />
                    <rect width={6} height={H} rx={3} className={i ? FILL[i.state] : "fill-muted"} />
                    <text x={14} y={22} className="fill-foreground text-[12px] font-medium">
                      {i ? (
                        <a href={i.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          <tspan className="fill-muted-foreground font-mono underline">#{n.id}</tspan>
                        </a>
                      ) : <tspan className="fill-muted-foreground font-mono">#{n.id}</tspan>}
                      {" "}{i ? clip(i.title, 27) : "outside the pipeline"}
                    </text>
                    <text x={14} y={42} className="fill-muted-foreground text-[11px]">
                      {i ? clip([i.state === "owner" ? "your task" : i.state, i.priority ? "▲ next" : "", i.rework && i.state === "ready" ? "rework" : "", i.milestone.split(" ")[0]].filter(Boolean).join(" · "), 34) : ""}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
