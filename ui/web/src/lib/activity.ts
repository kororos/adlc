import type { CiJob, CiRun, MergeTrain, Project } from "@/lib/api"

// What ADLC is doing right now, joined by issue: the delivery run, the merge train and the CI jobs of
// one issue's PR are one item, instead of three places to look. Built in the browser from the project
// payload (active runs, merge_train.json, the snapshot's Actions runs, the deployer and nightly state).

export type TrainEntry = MergeTrain["prs"][number] & { position: number }
export type LiveJob = { run: CiRun; job: CiJob }

export type ActivityItem = {
  issue: number
  title: string
  pr: number | null
  delivery: Project["active"][number] | null
  train: TrainEntry | null
  jobs: LiveJob[]           // running or waiting
  finished: number          // jobs already finished in the PR's active runs
}

export type Activity = {
  items: ActivityItem[]
  trainQueued: TrainEntry[] // approved, waiting behind the front of the train
  background: LiveJob[]     // CI not tied to an agent issue: main after a merge, the nightly, release
  deploy: {
    at: string | null; state: "idle" | "deploying" | "waiting-secrets" | "waiting-ci" | "error"; detail: string; since: string | null
    publish: CiRun | null   // the publish run of the commit being deployed (or waited for)
    noPublishRun: boolean   // waiting for CI, but GitHub has no publish run for that commit (a dropped push event)
  }
  nightlyRunning: boolean
}

const ISSUE_BRANCH = /^adlc\/(\d+)-/
// Train statuses that mean something is happening (or waiting for you) at that PR now.
const TRAIN_ACTIVE = new Set(["updating", "checks", "checking", "agent", "conflicts", "failed", "ready", "merged", "needs-reapproval", "needs-you", "blocked", "changes-requested"])

const live = (j: CiJob) => j.status !== "completed"

export function buildActivity(p: Project): Activity {
  const s = p.snapshot
  const titles = new Map<number, string>((s?.queue ?? []).map((q) => [q.number, q.title]))
  const prTitle = new Map<number, string>((s?.pullRequests ?? []).map((pr) => [pr.number, pr.title]))
  const prIssue = new Map<number, number>()
  for (const pr of s?.pullRequests ?? []) if (pr.closes[0]) prIssue.set(pr.number, pr.closes[0])
  const items = new Map<number, ActivityItem>()
  const item = (issue: number): ActivityItem => {
    let it = items.get(issue)
    if (!it) {
      it = { issue, title: titles.get(issue) ?? "", pr: null, delivery: null, train: null, jobs: [], finished: 0 }
      items.set(issue, it)
    }
    return it
  }

  for (const a of p.active) {
    const it = item(a.issue)
    it.delivery = a
    it.title ||= a.title
  }

  const train = p.mergeTrain?.prs.map((t, i) => ({ ...t, position: i + 1 })) ?? []
  const trainQueued: TrainEntry[] = []
  for (const t of train) {
    prIssue.set(t.pr, t.issue)
    if (!TRAIN_ACTIVE.has(t.status)) { trainQueued.push(t); continue }
    const it = item(t.issue)
    it.train = t
    it.pr = t.pr
    it.title ||= t.title || prTitle.get(t.pr) || ""
  }

  const background: LiveJob[] = []
  for (const run of s?.actions?.runs ?? []) {
    if (run.status === "completed") continue
    const fromBranch = Number(ISSUE_BRANCH.exec(run.branch)?.[1] ?? 0) || null
    const issue = fromBranch ?? (run.pr ? prIssue.get(run.pr) ?? null : null)
    const jobs = run.jobs.filter(live).map((job) => ({ run, job }))
    if (!issue) { background.push(...jobs); continue }
    const it = item(issue)
    it.pr ??= run.pr
    it.title ||= (run.pr && prTitle.get(run.pr)) || run.title
    // A run whose jobs haven't been listed yet still shows as one waiting entry.
    it.jobs.push(...(run.jobs.length ? jobs : [{ run, job: { name: run.workflow, status: "queued", conclusion: null, url: run.url, queuedAt: run.createdAt, startedAt: null, completedAt: null, runner: null, role: null, host: null, labels: [] } as CiJob }]))
    it.finished += run.jobs.filter((j) => !live(j)).length
  }

  // Deliveries first, then the train in its order, then PRs that only have CI running.
  const rank = (it: ActivityItem) => (it.delivery ? 0 : it.train ? 1 : 2)
  const sorted = [...items.values()].sort((a, b) => rank(a) - rank(b) || (a.train?.position ?? 0) - (b.train?.position ?? 0) || a.issue - b.issue)

  return { items: sorted, trainQueued, background, deploy: deployState(p), nightlyRunning: !!p.nightly?.last && p.nightly.last.status !== "completed" }
}

// The workflow run that publishes a commit's images: a run of that commit with a job on a publish runner
// (adlc-publish label), else one whose workflow is named publish. The newest one if it ran more than once.
const isPublish = (r: CiRun) => r.jobs.some((j) => j.labels.includes("adlc-publish") || j.role === "publish") || /publish/i.test(r.workflow)
function publishRun(p: Project, sha: string | undefined): CiRun | null {
  if (!sha) return null
  const runs = (p.snapshot?.actions?.runs ?? []).filter((r) => r.sha === sha && isPublish(r))
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

// The dev deployer from its state files and its log's last line.
function deployState(p: Project): Activity["deploy"] {
  const at = p.devDeployed
  const idle = { at, state: "idle" as const, since: null, detail: "", publish: null, noPublishRun: false }
  const missing = p.devMissingSecrets
  if (missing?.missing.length) {
    return { ...idle, state: "waiting-secrets", since: missing.since, publish: publishRun(p, /^sha-([0-9a-f]{7})/.exec(missing.tag)?.[1]), detail: `${missing.tag} waits for dev secret${missing.missing.length > 1 ? "s" : ""} ${missing.missing.map((m) => m.name).join(", ")}` }
  }
  const last = p.health.deployer?.last ?? ""
  const since = p.health.deployer?.updated ?? null
  const fresh = !!since && Date.now() - new Date(since).getTime() < 15 * 60_000
  const msg = last.replace(/^\S+ \[deployer\] /, "")
  const publish = publishRun(p, /\bsha-([0-9a-f]{7})\b/.exec(msg)?.[1])
  if (fresh && /^deploying /.test(msg)) return { ...idle, state: "deploying", since, detail: msg, publish }
  if (fresh && /^waiting for CI to publish/.test(msg)) {
    // The snapshot holds the active runs and those finished in the last 6 h, so a missing one never started.
    return { ...idle, state: "waiting-ci", since, detail: msg, publish, noPublishRun: !publish && !!p.snapshot?.actions && !p.snapshot.actions.error }
  }
  if (fresh && /^ERROR/.test(msg)) return { ...idle, state: "error", since, detail: msg.replace(/^ERROR: /, ""), publish }
  return idle
}
