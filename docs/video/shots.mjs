// Screenshots of the real dashboard (fed by fake-server.mjs) for the video, plus the boxes (CSS px) of the
// elements the video zooms to or highlights. Usage: node shots.mjs [names…]
import { chromium } from "playwright-core"
import fs from "node:fs"
import path from "node:path"

const OUT = path.join(import.meta.dirname, "shots")
fs.mkdirSync(OUT, { recursive: true })
const BASE = "http://127.0.0.1:4173"
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
export const DSF = 1.2   // 1600 CSS px wide → 1920 px images

// A mark: { sel } (CSS), or { text, up } — the element whose own text contains `text`, then its closest `up`.
const SHOTS = {
  overview: { url: "/", marks: {
    project: { text: "acme/orbit · updated", up: "div.rounded-xl, [data-slot=card]" },
    machines: { text: "Machines", up: "section, div" },
  } },
  now: { url: "/p/orbit?tab=now", marks: {
    stats: { text: "RUNNING", up: "div.grid" },
    activity: { sel: '[data-testid="activity"]' },
    row18: { sel: '[data-testid="activity-18"]' },
    row17: { sel: '[data-testid="activity-17"]' },
    deploy: { text: "Dev deploy:", up: "p" },
    run: { sel: "#run-card" },
    log: { sel: '[data-testid="run-log"]' },
  } },
  queue: { url: "/p/orbit?tab=queue", marks: {
    m2: { text: "M2 Booking", up: "[data-slot=card], div.rounded-xl" },
    r21: { text: "Waitlist when a class is full", up: "tr" },
    r25: { text: "[owner] Create the dev secret", up: "tr" },
    r19: { text: "Owners create recurring classes", up: "tr" },
  } },
  epics: { url: "/p/orbit?tab=epics", marks: {} },
  deps: { url: "/p/orbit?tab=deps", marks: { graph: { text: "An arrow goes from an issue", up: "[data-slot=card], div.rounded-xl" } } },
  attention: { url: "/p/orbit?tab=attention", marks: {
    train: { text: "feat(web): owner dashboard", up: "li" },
    review: { text: "feat(api): members pay for class packs", up: "li, a, div.rounded-xl" },
    triage: { text: "Flaky: booking.spec.ts", up: "li, div.rounded-xl" },
    question: { text: "Reminder before a class: e-mail or push?", up: "li, [data-slot=card], div.rounded-xl" },
    owner: { text: "Create the Stripe test key", up: "li, [data-slot=card], div.rounded-xl" },
  } },
  ci: { url: "/p/orbit?tab=ci", marks: {} },
  history: { url: "/p/orbit?tab=history", marks: { table: { sel: "table" } } },
  health: { url: "/p/orbit?tab=health", marks: {
    automation: { text: "Applied by the runner within a minute", up: "[data-slot=card], div.rounded-xl" },
    scope: { text: "Tests during delivery", up: "li, div.grid, div.flex" },
    nightly: { text: "Nightly checks", up: "[data-slot=card], div.rounded-xl" },
    components: { text: "starts runs, promotes the queue", up: "div.grid" },
  } },
  guide: { url: "/guide/", marks: {} },
}

const only = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: DSF, colorScheme: "dark" })
const boxesFile = path.join(OUT, "boxes.json")
const boxes = fs.existsSync(boxesFile) ? JSON.parse(fs.readFileSync(boxesFile, "utf8")) : {}
for (const [name, s] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(BASE + s.url, { waitUntil: "load" })
  await page.waitForTimeout(1500)
  // Make the window as tall as the page (capped), so the fixed sidebar spans the whole image.
  const h = Math.min(name === "guide" ? 1000 : 2600, Math.max(1000, await page.evaluate(() => document.documentElement.scrollHeight)))
  await page.setViewportSize({ width: 1600, height: h })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  boxes[name] = { w: 1600, h }
  for (const [k, m] of Object.entries(s.marks)) {
    boxes[name][k] = await page.evaluate(({ sel, text, up }) => {
      let el = null
      if (sel) el = document.querySelector(sel)
      else {
        const all = [...document.querySelectorAll("body *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(text)))
        el = all[0]?.closest(up) ?? all[0] ?? null
      }
      if (!el) return null
      const r = el.getBoundingClientRect()
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
    }, m)
  }
  console.log(name, errors.length ? `ERRORS: ${errors.join(" | ").slice(0, 300)}` : "ok", JSON.stringify(boxes[name]))
  await page.close()
}
fs.writeFileSync(boxesFile, JSON.stringify(boxes, null, 1))
await browser.close()
