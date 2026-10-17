// apps/<app>/src/lib/runtime-config.ts
// Environment-specific settings come from /config.json at startup (rendered by the nginx image
// from environment variables), so one image runs in every environment.
import { z } from "zod"

const RuntimeConfig = z.object({
  apiBasePath: z.string().startsWith("/"),
  environment: z.enum(["development", "test", "staging", "production"]),
})
export type RuntimeConfig = z.infer<typeof RuntimeConfig>

let config: RuntimeConfig | undefined

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const res = await fetch("/config.json", { cache: "no-store" })
  if (!res.ok) throw new Error(`config.json: HTTP ${res.status}`)
  config = RuntimeConfig.parse(await res.json())
  return config
}

export function runtimeConfig(): RuntimeConfig {
  if (!config) throw new Error("runtime config not loaded: call loadRuntimeConfig() in main.tsx first")
  return config
}
