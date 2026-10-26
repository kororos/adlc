import { useQuery } from "@tanstack/react-query"
import { Cpu, HardDrive, MemoryStick, Server } from "lucide-react"
import { Freshness } from "@/components/status"
import { Badge } from "@/components/ui/badge"
import { api, queryKeys, type Disk, type Host } from "@/lib/api"
import { diskTone, type Tone } from "@/lib/hosts"
import { cn } from "@/lib/utils"

const BAR: Record<Tone, string> = { ok: "bg-primary", warn: "bg-amber-500", bad: "bg-red-500" }
const TEXT: Record<Tone, string> = { ok: "text-muted-foreground", warn: "text-amber-600", bad: "text-red-600" }

function Meter({ icon: Icon, label, pct, value, tone }: { icon: typeof Cpu; label: string; pct: number | null; value: string; tone: Tone }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="size-3.5" />{label}</span>
        <span className={cn("tabular-nums", TEXT[tone])}>{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width]", BAR[tone])} style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }} />
      </div>
    </div>
  )
}

function HostTile({ h, limits }: { h: Host; limits: Disk | null | undefined }) {
  const cpu: Tone = h.cpuPct == null ? "ok" : h.cpuPct >= 95 ? "bad" : h.cpuPct >= 80 ? "warn" : "ok"
  const mem: Tone = !h.mem ? "ok" : h.mem.usedPct >= 95 ? "bad" : h.mem.usedPct >= 85 ? "warn" : "ok"
  const disk = diskTone(h.disk, limits)
  return (
    <div className={cn("grid gap-3 rounded-xl border bg-card p-4", h.stale && "opacity-60", disk === "bad" && "border-red-500/50")} data-testid={`host-${h.name}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <Server className="size-4 shrink-0 text-primary" /><span className="truncate">{h.name}</span>
          <Badge variant="secondary">{h.role === "main" ? "main" : "CI only"}</Badge>
        </span>
        {h.role === "ci" && <Freshness iso={h.at} staleAfterMin={3} />}
      </div>
      <Meter icon={Cpu} label={h.cores ? `CPU · ${h.cores} cores` : "CPU"} pct={h.cpuPct} tone={cpu}
        value={h.cpuPct == null ? "–" : `${Math.round(h.cpuPct)}%${h.load1 != null ? ` · load ${h.load1.toFixed(2)}` : ""}`} />
      <Meter icon={MemoryStick} label="Memory" pct={h.mem?.usedPct ?? null} tone={mem}
        value={h.mem ? `${Math.round(h.mem.usedPct)}% of ${h.mem.totalGb} GB` : "–"} />
      <Meter icon={HardDrive} label="Disk" tone={disk}
        pct={h.disk ? ((h.disk.totalGb - h.disk.freeGb) / h.disk.totalGb) * 100 : null}
        value={h.disk ? `${h.disk.freeGb} GB free of ${h.disk.totalGb} GB` : "–"} />
      {h.stale && <p className="text-xs text-amber-600">No report for over 3 minutes: on {h.name}, <code>adlc logs &lt;slug&gt; hoststats</code>.</p>}
    </div>
  )
}

// Every machine ADLC runs on: the main host (sampled by the dashboard) and CI-only hosts that report in.
export function HostsCard() {
  const hosts = useQuery({ queryKey: queryKeys.hosts, queryFn: api.hosts, refetchInterval: 15_000 })
  const limits = useQuery({ queryKey: queryKeys.disk, queryFn: api.disk, refetchInterval: 60_000 })
  if (!hosts.data?.length) return null
  return (
    <section className="grid gap-3" data-testid="hosts">
      <h2 className="font-semibold">Machines</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {hosts.data.map((h) => <HostTile key={h.name} h={h} limits={limits.data} />)}
      </div>
    </section>
  )
}
