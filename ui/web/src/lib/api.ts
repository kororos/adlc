// Typed access to the dashboard server. Everything is same-origin; actions send the
// x-adlc-request header the server requires (CSRF protection).

export type QueueState = "owner" | "ready" | "queued" | "in-progress" | "pr-open" | "needs-info" | "blocked" | "needs-human-review"

export type QueueItem = {
  rank: number
  number: number
  title: string
  url: string
  state: QueueState
  milestone: string
  blockers: { number: number; owner: boolean }[]
  unblocks: number
  priority?: boolean   // "run next" (label adlc:priority): first in line once a run slot is free
  rework?: boolean     // has an open agent PR: a run is a rework (conflicts, failed checks, review)
  epic?: number | null // parent epic
  epicFirst?: boolean  // its epic (or the epic above) has "run next"
  assignees: string[]
}

export type EpicItem = {
  number: number
  title: string
  url: string
  milestone: string
  priority: boolean   // "run next": its startable sub-issues go first
  total: number       // sub-issues, and how many are closed
  completed: number
  ready: number
  parent?: number | null  // the epic above, for a sub-epic
  subs?: EpicSub[] | null // all sub-issues, closed ones included (null: not fetched)
}

export type EpicSub = {
  number: number
  title: string
  url: string
  // the pipeline state; done = closed, epic = a sub-epic, untracked = no ADLC label, flaky/regression/spike = triage
  state: QueueState | "done" | "epic" | "untracked" | "flaky" | "regression" | "spike"
  closedAt: string | null
  rank: number | null     // position in the queue
  blockers: number[]
  pr: { number: number; url: string } | null
  priority: boolean
  total?: number          // sub-epics: their progress
  completed?: number
}

export type TriageItem = {
  number: number
  title: string
  url: string
  kind: "flaky" | "regression" | "spike"
  created: string
  milestone: string
  blockers: number[]
  lastComment: { author: string; at: string; url: string; body: string } | null
}

export type AttentionItem = QueueItem & {
  lastComment: { author: string; at: string; url: string; body: string } | null
}

export type PullRequest = {
  number: number
  title: string
  url: string
  draft: boolean
  createdAt: string
  author: string
  reviewDecision: string | null
  mergeState: string
  labels: string[]
  closes: number[]
  checks: "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED" | null
}

export type CiRole = "test" | "publish" | "kvm" | "self-hosted" | "github"

export type CiJob = {
  name: string
  status: "queued" | "in_progress" | "completed" | "waiting" | "pending" | "requested"
  conclusion: string | null
  url: string
  queuedAt: string | null
  startedAt: string | null
  completedAt: string | null
  runner: string | null
  role: CiRole | null
  host: string | null   // CI-only host that ran it (null: the main ADLC host)
  labels: string[]
}

export type CiRun = {
  id: number
  workflow: string
  title: string
  branch: string
  event: string
  sha: string
  pr: number | null
  url: string
  status: string
  conclusion: string | null
  createdAt: string
  startedAt: string | null
  updatedAt: string
  jobs: CiJob[]
}

export type SettingKey = "merge_train" | "ci_auto_rework" | "keep_prs_current" | "rework_first" | "max_open_prs"
export type Setting = { key: SettingKey; value: string; source: "dashboard" | "env" | "adlc.yaml" | "default"; project: string; allowed: string[] }
export type ProjectAction = "pause" | "resume" | `${SettingKey}:${string}` | `prioritize:${number}` | `deprioritize:${number}` | `start:${number}`

export type MergeTrainStatus =
  | "queued" | "updating" | "checks" | "ready" | "merged" | "agent" | "conflicts" | "checking"
  | "failed" | "blocked" | "needs-reapproval" | "changes-requested" | "hold"
export type MergeTrain = {
  mode: "on" | "dry-run"
  updated: string
  prs: { pr: number; issue: number; status: MergeTrainStatus; detail: string }[]
}

export type Snapshot = {
  generatedAt: string
  repo: string
  counts: Partial<Record<QueueState, number>>
  queue: QueueItem[]
  wip?: { openPrs: number; max: number | null; held: boolean }   // new issues wait while held
  // Issues opened by agents or the nightly (flaky, regression, spike) without a pipeline state: you decide.
  triage?: TriageItem[]
  epics?: EpicItem[]
  cyclic: number[]
  attention: AttentionItem[]
  pullRequests: PullRequest[]
  actions?: { generatedAt: string; runs: CiRun[]; error?: string }
}

export type RunResult = {
  outcome: string
  error: boolean
  costUsd: number | null
  durationMs: number | null
  turns: number | null
  text: string
}

export type Run = { file: string; issue: number; started: string; updated: string | null; result: RunResult | null }

export type Component = "poller" | "deployer" | "rc"

export type Disk = { freeGb: number; totalGb: number; minFreeGb: number; warnPct: number }

export type RunProgress = { phase: string; risk: "low" | "medium" | "high" | null; tasks: number | null }

export type ProjectSummary = {
  slug: string
  repo: string
  paused: boolean
  backoffUntil: string | null
  pending: { action: string; at: string }[]
  active: { issue: number; title: string; run: Run | null; progress: RunProgress | null }[]
  counts: Snapshot["counts"] | null
  snapshotAt: string | null
  attention: number
  reviews: number
  ciRunning: number
}

export type Project = Omit<ProjectSummary, "counts" | "snapshotAt" | "attention" | "reviews" | "ciRunning"> & {
  baseDomain: string
  loggedIn: boolean
  devDeployed: string | null
  dockerUsage: { text: string; updated: string } | null
  mergeTrain: MergeTrain | null
  devMissingSecrets: { tag: string; since: string; missing: { name: string; path: string; hint: string }[] } | null
  settings: Setting[] | null
  health: Record<Component, { updated: string | null; last: string }>
  snapshot: Snapshot | null
}

export type RunEvent =
  | { kind: "start"; model: string; sub: boolean }
  | { kind: "text"; text: string; sub: boolean }
  | { kind: "tool"; tool: string; summary: string; sub: boolean }
  | ({ kind: "result"; sub: boolean } & RunResult)

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: {
      ...(method === "POST" ? { "x-adlc-request": "1" } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText)
  return data as T
}

export const api = {
  session: () => request<{ authenticated: boolean; configured: boolean }>("GET", "/api/session"),
  login: (token: string) => request<{ ok: true }>("POST", "/api/login", { token }),
  logout: () => request<{ ok: true }>("POST", "/api/logout"),
  projects: () => request<ProjectSummary[]>("GET", "/api/projects"),
  project: (slug: string) => request<Project>("GET", `/api/projects/${slug}`),
  runs: (slug: string) => request<Run[]>("GET", `/api/projects/${slug}/runs?limit=100`),
  disk: () => request<Disk | null>("GET", "/api/disk"),
  action: (slug: string, action: ProjectAction) => request<{ ok: true }>("POST", `/api/projects/${slug}/actions`, { action }),
}

export const queryKeys = {
  session: ["session"] as const,
  projects: ["projects"] as const,
  project: (slug: string) => ["project", slug] as const,
  runs: (slug: string) => ["runs", slug] as const,
  disk: ["disk"] as const,
}
