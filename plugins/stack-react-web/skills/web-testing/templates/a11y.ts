// apps/<app>/e2e/a11y.ts: axe check for key pages (WCAG 2.1 A/AA).
import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

export async function expectNoA11yViolations(page: Page, exclude: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
  for (const selector of exclude) builder = builder.exclude(selector)
  const { violations } = await builder.analyze()
  expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([])
}
