import type { RunProgress } from "@/lib/api"

export const PHASES = [
  { id: "understand", label: "Understand" },
  { id: "design", label: "Design" },
  { id: "tests", label: "Tests" },
  { id: "build", label: "Build" },
  { id: "verify", label: "Verify" },
  { id: "qa", label: "QA" },
  { id: "review", label: "Review" },
  { id: "release", label: "PR" },
] as const

// state.json `phase` is the phase in progress ("design") or the last one finished
// ("tests-done", so Build is running now). Returns the index of the phase running now;
// PHASES.length means everything is done. A rework uses the same names from Build on; runs from
// before plugin 0.1.33 wrote only "rework-<k>" for the whole rework, shown as Build.
export function currentPhaseIndex(progress: RunProgress | null | undefined): number {
  const phase = progress?.phase.toLowerCase() ?? ""
  if (/^rework-\d+$/.test(phase)) return PHASES.findIndex((p) => p.id === "build")
  const idx = PHASES.findIndex((p) => phase.startsWith(p.id))
  if (idx < 0) return 0
  return phase.endsWith("-done") ? idx + 1 : idx
}

export function currentPhaseLabel(progress: RunProgress | null | undefined): string {
  if (!progress) return "starting"
  const i = currentPhaseIndex(progress)
  const rework = progress.rework ? `Rework ${progress.rework} · ` : ""
  return rework + (i >= PHASES.length ? "finishing" : `${PHASES[i].label} · step ${i + 1} of ${PHASES.length}`)
}
