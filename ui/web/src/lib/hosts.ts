import type { Disk, Host } from "@/lib/api"

export type Tone = "ok" | "warn" | "bad"

// Same levels as the dev server's disk: below the minimum is red, below twice it or over the warning share amber.
export function diskTone(d: Host["disk"], limits: Disk | null | undefined): Tone {
  if (!d || !limits) return "ok"
  if (d.freeGb < limits.minFreeGb) return "bad"
  return d.freeGb < limits.minFreeGb * 2 || (d.totalGb - d.freeGb) * 100 >= limits.warnPct * d.totalGb ? "warn" : "ok"
}
