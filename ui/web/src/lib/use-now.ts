import { useEffect, useState } from "react"

// The current time, refreshed every `everyMs`, so relative times stay correct without reading
// the clock during render.
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}
