const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never"
  const s = Math.round((new Date(iso).getTime() - now) / 1000)
  const abs = Math.abs(s)
  if (abs < 60) return rtf.format(s, "second")
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute")
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour")
  return rtf.format(Math.round(s / 86400), "day")
}

export function duration(ms: number | null | undefined): string {
  if (ms == null) return "–"
  const m = Math.floor(ms / 60000)
  if (m < 1) return `${Math.round(ms / 1000)}s`
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// Milliseconds from `from` to `to` (now while it's still running).
export const elapsedMs = (from: string, to?: string | null, now = Date.now()) => (to ? Date.parse(to) : now) - Date.parse(from)

export const usd = (n: number | null | undefined) => (n == null ? "–" : `$${n.toFixed(2)}`)

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "–"
