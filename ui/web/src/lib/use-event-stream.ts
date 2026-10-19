import { useEffect, useState } from "react"

// Subscribes to a server-sent-events stream that first sends a "backlog" array, then appends
// batches (event `append`). Keeps at most `max` items.
export function useEventStream<T>(url: string | null, append: string, max = 5000) {
  const [items, setItems] = useState<T[]>([])
  const [status, setStatus] = useState<"connecting" | "live" | "closed">("connecting")

  useEffect(() => {
    if (!url) return
    setItems([])
    setStatus("connecting")
    const es = new EventSource(url, { withCredentials: true })
    es.addEventListener("backlog", (e) => {
      setItems((JSON.parse((e as MessageEvent).data) as T[]).slice(-max))
      setStatus("live")
    })
    es.addEventListener(append, (e) => {
      const more = JSON.parse((e as MessageEvent).data) as T[]
      setItems((prev) => [...prev, ...more].slice(-max))
    })
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "closed" : "connecting")
    return () => es.close()
  }, [url, append, max])

  return { items, status }
}
