import type { MergeTrainStatus } from "@/lib/api"

// How the merge train's statuses read on the dashboard (Needs you → Merge train, and Now).
export const TRAIN_TONE: Partial<Record<MergeTrainStatus, string>> = {
  "needs-reapproval": "text-amber-600 dark:text-amber-400",
  "changes-requested": "text-amber-600 dark:text-amber-400",
  conflicts: "text-amber-600 dark:text-amber-400",
  failed: "text-red-600 dark:text-red-400",
  blocked: "text-red-600 dark:text-red-400",
  "needs-you": "text-red-600 dark:text-red-400",
  ready: "text-emerald-600 dark:text-emerald-400",
  merged: "text-emerald-600 dark:text-emerald-400",
}
export const TRAIN_LABEL: Record<MergeTrainStatus, string> = {
  queued: "queued", updating: "updating", checks: "checks running", ready: "ready to merge", merged: "merged",
  agent: "agent working", conflicts: "conflicts", checking: "checking", failed: "checks failed", blocked: "blocked",
  "needs-reapproval": "re-approve", "changes-requested": "changes requested", hold: "on hold", "needs-you": "needs you",
}
