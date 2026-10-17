---
name: vite-spa
description: Conventions for React + Vite + TypeScript single-page web apps in ADLC projects, with shadcn/ui (Base UI) and Tailwind CSS v4 as the default UI kit. Covers layout, routing and data fetching, forms, runtime config, same-origin auth, the UI kit and theming, i18n, accessibility, performance budgets and the review checklist. Load before designing, implementing, reviewing or debugging web app code.
---

# React + Vite SPA conventions

These are defaults. Accepted ADRs override them. Check library APIs with Context7 before you use anything version-sensitive (Vite, TanStack, shadcn, Tailwind move fast).

Templates in `templates/`: `vite.config.ts`, `runtime-config.ts`, `index.css`.

## Layout (pnpm monorepo; `<app>` is e.g. `web`)
```
apps/<app>/
  index.html · vite.config.ts · components.json (shadcn) · Dockerfile · nginx/default.conf.template
  src/main.tsx            load runtime config → create router + query client → render
  src/routes/             one module per route (lazy-loaded); route = data loading + layout, no business logic
  src/features/<feature>/ components/ · hooks/ (queries and mutations) · schemas.ts · *.test.tsx
  src/components/ui/      shadcn components: owned code, generic (no feature logic)
  src/components/         shared app components built from ui/
  src/lib/                runtime-config.ts · query-client.ts · utils.ts (cn) · i18n.ts
  src/styles/index.css    Tailwind entry and theme variables
  e2e/                    Playwright specs (stack-react-web:web-testing)
packages/                 contracts (zod) · api-client · domain · tokens · i18n (shared with other apps)
```
- Dependencies point one way: routes → features → components/ui, lib. Features don't import each other's internals; shared code moves to `components/` or a package. `arch_check` (dependency-cruiser) enforces this.
- Default stack, unless an ADR says otherwise: **React 19, Vite, TypeScript strict, TanStack Router** (typed routes), **TanStack Query** (server state), **react-hook-form + zod** (forms, schemas from `packages/contracts`), **shadcn/ui on Base UI + Tailwind CSS v4** (UI kit), **i18next**, **lucide-react** icons, **sonner** toasts.

## Data and state
- Server state lives in TanStack Query only. Components never call `fetch` directly; they use hooks from `features/<feature>/hooks`, which call `packages/api-client`.
- One query-key factory per feature (`clientKeys.detail(id)`). Mutations invalidate or update exactly the keys they affect.
- Local UI state stays in components; cross-route client state (rare) goes in a small store with an ADR. No global store by default.
- Route loaders prefetch with `queryClient.ensureQueryData` so pages render without waterfalls.
- Every list is paginated or virtualised (TanStack Table + `@tanstack/react-virtual` for long tables).

## Forms
- react-hook-form with `zodResolver` and the **same schema as the API** (`packages/contracts`). Show server validation errors (`error.details`) on the matching fields.
- Build forms with the shadcn form components (Field, Input, Select…). Every input has a visible label and an error message linked via `aria-describedby`.
- Disable submit while pending, and make submits idempotent where the API supports `Idempotency-Key`.

## Runtime config (build once, promote by tag)
- Nothing environment-specific is baked in at build time. `src/main.tsx` fetches `/config.json` (served by the nginx image from environment variables, see `stack-react-web:web-containers`) before rendering. Template: `runtime-config.ts`.
- `import.meta.env` is only for build-time constants that are the same in every environment. **Never put secrets in it**: everything in the bundle is public.

## Auth (same origin)
- The SPA and its API share one origin (`/api/*` is routed to the API by Traefik), so there's no CORS. Sessions are httpOnly, Secure, SameSite cookies set by the API. The SPA never reads or stores tokens.
- On `401`, clear the query cache and redirect to sign-in, keeping the return path. On `403`, show a "no access" page. Never rely on hiding UI for authorisation: the API checks every request.

## UI kit: shadcn/ui (Base UI) + Tailwind CSS v4
- **Set up once** (walking skeleton), in the app folder, after Tailwind (`tailwindcss`, `@tailwindcss/vite`, `@import "tailwindcss";` in the CSS entry) and the `@/*` alias exist:
  ```
  pnpm dlx shadcn@latest init -t vite -b base -p vega --no-monorepo -y
  ```
  `-b base` = Base UI primitives (an ADR may pick `radix` or `aria`). `-p` is required to run unattended: `vega` = Lucide icons + Inter (covers Latin, Greek and Cyrillic), self-hosted via `@fontsource-variable/inter`. Tailwind v4 is CSS-first (no `tailwind.config.js`).
- **Alias:** `"paths": { "@/*": ["./src/*"] }` in `tsconfig.json` and `tsconfig.app.json`, **without `baseUrl`** (deprecated in TypeScript 6; it fails the build), plus `resolve.alias` in `vite.config.ts` (template).
- **Add components with the CLI** (`pnpm dlx shadcn@latest add dialog table …`) and commit them. They are owned code under `src/components/ui/`: read them, keep them generic, and don't fork one per feature. Compose or wrap them in `components/` instead.
- Before writing a new component, check `components/ui/` and the shadcn registry. Reuse beats reinvention.
- **Theme:** shadcn components read CSS variables (`--background`, `--primary`, `--radius`…). Map design tokens (e.g. `packages/tokens`) onto those variables in `src/styles/index.css` (template). No hard-coded colours or one-off inline styles in features.
- Recommended pairings (all match the shadcn components): tables = **Data Table** on TanStack Table; charts = **Chart** on Recharts; dates = **Calendar / Date Picker** (react-day-picker, with the app locale); toasts = **Sonner**; command palette = **Command**.
- Fonts are self-hosted (`@fontsource/*` packages), never loaded from a font CDN (privacy, and the CSP blocks it).

## i18n and formatting
- All user-visible text goes through i18next keys; no string literals in JSX. Format numbers, dates and units with `Intl` in the user's locale and time zone.
- Keys are checked in CI (missing or unused keys fail `lint`).

## Accessibility (WCAG 2.1 AA by default)
- Semantic HTML first; the Base UI primitives handle focus and ARIA for complex widgets. Don't override their keyboard behaviour.
- Move focus to the page heading on route change, and announce async results (toasts are live regions).
- Colour contrast comes from the theme variables; check new themes with axe. Key pages run axe in e2e (`stack-react-web:web-testing`).

## Performance
- Every route is lazy-loaded. Heavy libraries (charts, calendar, PDF preview) load only in the routes that use them.
- A bundle budget is part of `arch_check` (for example `size-limit` on the initial JS and CSS). Raising it needs a reason in the PR.
- Images have explicit sizes; lists over ~100 rows are virtualised.

## Errors and observability
- One top-level error boundary plus one per route. Report errors to the API's client-error endpoint, scrubbed of PII (no form values, no URLs with IDs in query strings).
- Show the user a recoverable error state (retry) instead of a blank page.

## Review checklist (web)
- Data only through query hooks and the api-client; keys correct; mutations invalidate what they change.
- Forms use the contract schema; server errors shown on fields; labels and error text present.
- Uses existing `components/ui/` and `components/`; no forked UI components; no hard-coded colours or inline styles.
- No secrets or environment-specific values in `import.meta.env`; runtime config used instead.
- Route lazy-loaded; bundle budget respected; long lists virtualised.
- Text through i18n; `data-testid` on elements the e2e tests use; axe clean on changed pages.
