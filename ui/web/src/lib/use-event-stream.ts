import { useEffect, useState } from "react"

type Stream<T> = { url: string | null; items: T[]; status: "connecting" | "live" | "closed" }

// Subscribes to a server-sent-events stream that first sends a "backlog" array, then appends
// batches (event `append`). Keeps at most `max` items. Switching `url` starts from scratch.
export function useEventStream<T>(url: string | null, append: string, max = 5000) {
  const [s, setS] = useState<Stream<T>>({ url, items: [], status: "connecting" })
  if (s.url !== url) setS({ url, items: [], status: "connecting" }) // reset during render, not in an effect

  useEffect(() => {
    if (!url) return
    const es = new EventSource(url, { withCredentials: true })
    const update = (f: (prev: Stream<T>) => Stream<T>) => setS((prev) => (prev.url === url ? f(prev) : prev))
    es.addEventListener("backlog", (e) => {
      const items = (JSON.parse((e as MessageEvent).data) as T[]).slice(-max)
      update((prev) => ({ ...prev, items, status: "live" }))
    })
    es.addEventListener(append, (e) => {
      const more = JSON.parse((e as MessageEvent).data) as T[]
      update((prev) => ({ ...prev, items: [...prev.items, ...more].slice(-max) }))
    })
    es.onerror = () => update((prev) => ({ ...prev, status: es.readyState === EventSource.CLOSED ? "closed" : "connecting" }))
    return () => es.close()
  }, [url, append, max])

  return { items: s.items, status: s.status }
}
