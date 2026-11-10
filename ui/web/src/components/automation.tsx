import { useMutation, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, SlidersHorizontal } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, queryKeys, type Project, type Setting, type SettingKey } from "@/lib/api"
import { cn } from "@/lib/utils"

const ABOUT: Record<SettingKey, { title: string; what: string; values: Record<string, string> }> = {
  merge_train: {
    title: "Merge train",
    what: "Approved agent PRs are merged one after another: each is brought up to date, checked and merged. You re-approve only when the PR’s own change differs from what you approved (carrying it onto a newer main, even through conflicts, keeps your approval).",
    values: { on: "merges", "dry-run": "reports only", off: "off" },
  },
  ci_auto_rework: {
    title: "Rework on failed checks and conflicts",
    what: "An agent PR whose checks fail or that conflicts with main goes back to the agent (twice at most, then to you).",
    values: { on: "on", off: "off" },
  },
  keep_prs_current: {
    title: "Keep green PRs up to date",
    what: "An agent PR with green checks that fell behind main gets main merged in, so it stays mergeable.",
    values: { on: "on", off: "off" },
  },
  rework_first: {
    title: "Rework before new work",
    what: "Issues whose PR needs work (conflicts, failed checks, your review) run before new issues, so open PRs get finished first.",
    values: { on: "on", off: "off" },
  },
  max_open_prs: {
    title: "Limit open PRs",
    what: "No new issue starts while this many agent PRs are open (waiting for your review, a merge or a rework). Reworks still run.",
    values: { off: "no limit" },
  },
  update_before_merge: {
    title: "Update before merge",
    what: "A PR behind main is updated and re-checked before it merges (always), or only when main changed files it changes too, or lockfiles, migrations or CI config (overlap). Overlap needs \"Require branches to be up to date\" off in branch protection.",
    values: { always: "always", overlap: "only on overlap" },
  },
  verify_scope: {
    title: "Tests during delivery",
    what: "What the agent's own verify runs: the tests the change affects, plus lint, typecheck, arch checks and build on everything (affected), the whole suite (full), or full for high-risk issues and affected for the rest (auto; the run decides once its design sets the risk). PR CI always runs the full suite before a merge. The label adlc:verify-full or adlc:verify-affected on an issue overrides this for that issue.",
    values: { affected: "affected", auto: "auto (full if high risk)", full: "full" },
  },
}
const SOURCE: Record<Setting["source"], string> = {
  dashboard: "set here", env: "set on the dev server", "adlc.yaml": "from adlc.yaml", default: "default",
}

// The automation switches. Changes go to the runner as requests (like pause/resume) and apply within a
// minute; "use project setting" drops the dashboard override and goes back to adlc.yaml or the default.
export function AutomationCard({ p }: { p: Project }) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: (action: `${SettingKey}:${string}`) => api.action(p.slug, action),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.project(p.slug) }),
  })
  if (!p.settings) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" />Automation</CardTitle>
        <CardDescription>Applied by the runner within a minute. They don't change adlc.yaml.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {p.settings.map((s) => {
          const about = ABOUT[s.key]
          const pending = p.pending.find((r) => r.action.startsWith(`${s.key}:`)) ??
            (m.isPending && m.variables?.startsWith(`${s.key}:`) ? { action: m.variables } : undefined)
          return (
            <div key={s.key} className="grid gap-2 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
              <div className="min-w-0">
                <p className="font-medium">{about?.title ?? s.key}</p>
                <p className="text-sm text-muted-foreground">{about?.what}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {SOURCE[s.source]}
                  {s.source === "dashboard" && (
                    <> · project setting: {about?.values[s.project] ?? s.project} ·{" "}
                      <button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={!!pending}
                        onClick={() => m.mutate(`${s.key}:default`)}>use project setting</button></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {pending && <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="change requested" />}
                <div className="inline-flex rounded-lg border bg-card p-0.5" role="radiogroup" aria-label={about?.title ?? s.key}>
                  {s.allowed.map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={s.value === v} disabled={!!pending}
                      onClick={() => s.value !== v && m.mutate(`${s.key}:${v}`)}
                      className={cn("rounded-md px-2.5 py-1 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed",
                        s.value === v && (v === "off" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground hover:text-primary-foreground"))}>
                      {about?.values[v] ?? v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
        {m.isError && <p className="text-sm text-destructive">{(m.error as Error).message}</p>}
      </CardContent>
    </Card>
  )
}
