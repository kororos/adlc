---
name: web-testing
description: Testing React + Vite SPAs in ADLC projects. Covers Vitest with jsdom and Testing Library for unit and component tests, what to test at each level, Playwright e2e against the per-run environment (build mode for gating), accessibility checks with axe, secure-context flags for passkeys and Secure cookies on plain-HTTP preview URLs, and test ids. Load when writing or reviewing web tests, the Vitest or Playwright config, or e2e targets in adlc.build.yaml.
---

# Web testing

Templates in `templates/`: `vitest.config.ts`, `test-setup.ts`, `playwright.config.ts`, `a11y.ts`. The testing contract (`adlc-core:testing-contract`) decides which levels run when; Playwright conventions from `stack-react-native:e2e-patterns` apply where both packs are enabled.

## Levels
- **Unit** (Vitest, node): pure logic: formatters, schema refinements, query-key factories, reducers. Fast and many.
- **Component** (Vitest + jsdom + Testing Library): one feature component with its hooks, the network mocked at the `fetch` level (MSW) or the api-client mocked. Query by role and label (`getByRole('button', { name })`), never by class names. Assert what the user sees, including loading, empty and error states.
- **E2E** (Playwright, chromium per run): user journeys against the real stack in the per-run environment. Tagged `@smoke` for the per-run selection; the full set runs nightly.
- Don't test shadcn/Base UI internals; test your usage of them (e.g. that the dialog opens and traps focus once, in e2e).

## Vitest
- Config in `vitest.config.ts` (template): jsdom for `*.test.tsx`, setup file with `@testing-library/jest-dom`, CSS disabled, `restoreMocks`.
- Each test creates its own `QueryClient` (`retry: false`) and wraps the component with the providers it needs (router, i18n with the real resources, query client). Put that in one `renderWithProviders` helper.
- Run one file: `pnpm --filter <app> exec vitest run <file>` (this is `commands.test_file` in adlc.build.yaml).

## Playwright
- Specs in `apps/<app>/e2e/*.spec.ts`; `baseURL` from `E2E_BASE_URL` (`http://<run>.app.<slug>.<base>[:port]`, set by the test environment).
- Gating runs (`start_build` mode) test the real nginx image, so CSP and headers are covered.
- **Secure context on plain HTTP:** per-run preview URLs are HTTP. If the app needs a secure context (passkeys/WebAuthn, `Secure` or `__Host-` cookies), chromium starts with `--unsafely-treat-insecure-origin-as-secure=<origin>` (template), and WebAuthn tests use a CDP virtual authenticator.
- Stable selectors: `getByRole`/`getByLabel` first, `data-testid` for things without an accessible name. Never CSS classes (Tailwind classes change constantly).
- No fixed waits. Use web-first assertions (`await expect(locator).toBeVisible()`).
- Each test creates its own data through the API or seed helpers, so runs don't depend on order.
- `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`; reports go to the run's `reports/`.

## Accessibility
- `a11y.ts` (template) runs axe (`@axe-core/playwright`) with the WCAG 2.1 A/AA tags. Call it on every key page in a `@smoke` spec; violations fail the test.
- New pages or dialogs get an axe check in the same PR.

## Review checklist (web tests)
- Every AC has a test at the right level; component tests cover loading, empty and error states.
- Queries by role or label; no CSS-class selectors; no `waitForTimeout`.
- Key pages axe-checked; e2e creates its own data.
