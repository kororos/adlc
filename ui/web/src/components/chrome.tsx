import { Check, Monitor, Moon, Sun } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import type { RunProgress } from "@/lib/api"
import { PHASES, currentPhaseIndex } from "@/lib/phases"
import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path d="M8 21.5 13 10l5 11.5M10 17.5h6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground" />
        <circle cx="23" cy="21" r="2.4" className="fill-primary-foreground" />
      </svg>
      ADLC
    </span>
  )
}

type Theme = "system" | "light" | "dark"
const THEMES: { id: Theme; icon: typeof Sun; label: string }[] = [
  { id: "system", icon: Monitor, label: "System theme" },
  { id: "light", icon: Sun, label: "Light theme" },
  { id: "dark", icon: Moon, label: "Dark theme" },
]

function readTheme(): Theme {
  try { return (localStorage.getItem("adlc-theme") as Theme) || "system" } catch { return "system" }
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches))
    apply()
    try { localStorage.setItem("adlc-theme", theme) } catch { /* private mode */ }
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [theme])
  return [theme, setTheme] as const
}

export function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  return (
    <div className="inline-flex rounded-lg border bg-card p-0.5" role="radiogroup" aria-label="Theme">
      {THEMES.map(({ id, icon: Icon, label }) => (
        <button key={id} type="button" role="radio" aria-checked={theme === id} aria-label={label} title={label}
          onClick={() => setTheme(id)}
          className={cn("rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground", theme === id && "bg-accent text-accent-foreground")}>
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  )
}

export function Stat({ icon: Icon, label, value, tone = "default", hint }: {
  icon: typeof Sun; label: string; value: ReactNode; tone?: "default" | "primary" | "warn" | "danger" | "ok"; hint?: ReactNode
}) {
  const tones = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/12 text-primary",
    warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    danger: "bg-red-500/12 text-red-600 dark:text-red-400",
    ok: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  }
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", tones[tone])}><Icon className="size-4.5" /></span>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="truncate text-lg leading-tight font-semibold tabular-nums">{value}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children }: { icon: typeof Sun; title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed bg-card/50 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-5" /></span>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}

export function PhaseStepper({ progress }: { progress: RunProgress | null }) {
  const current = currentPhaseIndex(progress)
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label={progress?.rework ? `Rework ${progress.rework} phases` : "Delivery phases"}>
      {progress?.rework ? (
        <li className="mr-1">
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
            title="Changes to an open PR: requests, failed checks or conflicts. It starts at Build.">
            Rework {progress.rework}
          </span>
        </li>
      ) : null}
      {PHASES.map((p, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo"
        return (
          <li key={p.id} className="flex items-center gap-1" aria-current={state === "active" ? "step" : undefined}>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              state === "done" && "bg-primary/12 text-primary",
              state === "active" && "bg-primary text-primary-foreground shadow-sm",
              state === "todo" && "bg-muted text-muted-foreground")}>
              {state === "done" ? <Check className="size-3" /> : state === "active" ? <span className="size-1.5 animate-pulse rounded-full bg-current" /> : null}
              {p.label}
            </span>
            {i < PHASES.length - 1 && <span className={cn("h-px w-3", i < current ? "bg-primary/40" : "bg-border")} />}
          </li>
        )
      })}
    </ol>
  )
}
