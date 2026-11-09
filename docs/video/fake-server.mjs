// Serves the built dashboard (dist/) with the synthetic "orbit" data, for screenshots. Local only.
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import * as F from "./fixtures.mjs"

const DIST = process.env.DIST ?? path.join(import.meta.dirname, "dist")
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2" }

const json = (res, data) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(data)) }
const sse = (res, backlog) => {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
  res.write(`event: backlog\ndata: ${JSON.stringify(backlog)}\n\n`)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  const p = url.pathname
  if (p.startsWith("/api/")) {
    if (p === "/api/session") return json(res, { authenticated: true, configured: true })
    if (p === "/api/projects") return json(res, [F.summary])
    if (p === "/api/projects/orbit") return json(res, F.project)
    if (p === "/api/projects/orbit/runs") return json(res, F.runs)
    if (p === "/api/projects/orbit/runs/totals") return json(res, F.totals)
    if (p === "/api/hosts") return json(res, F.hosts)
    if (p === "/api/disk") return json(res, F.disk)
    if (/^\/api\/projects\/orbit\/runs\/.+\/events$/.test(p)) return sse(res, F.runEvents)
    const m = p.match(/^\/api\/projects\/orbit\/logs\/(\w+)$/)
    if (m) return sse(res, F.logLines[m[1]] ?? [])
    if (req.method === "POST") return json(res, { ok: true })
    res.writeHead(404); return res.end("{}")
  }
  let file = path.join(DIST, decodeURIComponent(p))
  if (p.endsWith("/")) file = path.join(file, "index.html")
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html")
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" })
  fs.createReadStream(file).pipe(res)
})
server.listen(Number(process.env.PORT ?? 4173), "127.0.0.1", () => console.log("fake dashboard on", server.address().port))
