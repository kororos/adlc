// apps/<app>/playwright.config.ts
import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080"
// Per-run preview URLs are plain HTTP. Treat this origin as secure so passkeys (WebAuthn) and
// Secure / __Host- cookies work exactly as they will over HTTPS.
const origin = new URL(baseURL).origin

export default defineConfig({
  testDir: "./e2e",
  retries: 0, // the ADLC testing contract handles retries and flakiness
  reporter: [["list"], ["html", { open: "never", outputFolder: process.env.E2E_REPORT_DIR ?? "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    testIdAttribute: "data-testid",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: [`--unsafely-treat-insecure-origin-as-secure=${origin}`] },
      },
    },
  ],
})
