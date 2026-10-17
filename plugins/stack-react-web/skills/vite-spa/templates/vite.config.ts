// apps/<app>/vite.config.ts
// The ADLC edge proxy (Traefik) serves the app at per-run and dev hosts such as
//   http://<run>.app.<slug>.<base>[:port]  and  http://app.<slug>.<base>[:port]
// Vite only answers hosts it knows (DNS-rebinding protection), and the HMR websocket must go
// through the edge port. Both come from the ADLC environment.
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const projectDomain = process.env.ADLC_PROJECT_DOMAIN // e.g. diet.10-0-1-10.nip.io
const edgePort = Number(process.env.ADLC_EDGE_PORT ?? 80)
const allowedHosts = projectDomain ? [`.${projectDomain}`] : []

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: {
    host: "0.0.0.0",
    port: 8080, // same port as the nginx image, so compose and Traefik don't change between modes
    strictPort: true,
    allowedHosts,
    hmr: projectDomain ? { clientPort: edgePort } : undefined,
  },
  preview: { host: "0.0.0.0", port: 8080, strictPort: true, allowedHosts },
  build: {
    sourcemap: false, // set "hidden" when an error tracker needs maps (never served)
  },
})
