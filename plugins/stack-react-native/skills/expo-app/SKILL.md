---
name: expo-app
description: Conventions for building the React Native app with Expo (web, Android, iOS) in ADLC projects. Covers project layout, routing, state and data fetching, forms, config and secrets, secure storage, offline, platform differences, accessibility, testIDs and EAS. Load before designing, implementing, reviewing or debugging app code.
---

# Expo app conventions

These are defaults. Accepted ADRs in `docs/architecture/adr/` override them. Check current APIs with Context7 (Expo SDK, expo-router, React Native) before you use anything version-sensitive. Don't rely on memory for SDK details.

## Layout (pnpm monorepo)
```
apps/app/                 Expo app (web + Android + iOS)
  app/                    expo-router routes (file-based); keep screens thin
  src/features/<feature>/ components, hooks, api calls, state for one feature
  src/ui/                 shared design-system components
  src/lib/                api client, config, storage, i18n, telemetry
  e2e/web/                Playwright specs        e2e/flows/  Maestro flows
packages/contracts/       shared API types/schemas (generated from or feeding the API's OpenAPI)
```
- A feature folder owns its components, hooks and API calls. Cross-feature imports go only through the feature's `index.ts`. The architecture checks (`arch_check`) enforce this.
- Use TypeScript `strict`. No `any` without a comment saying why.

## Data and state
- **Server state:** TanStack Query, behind a typed API client generated from or based on `packages/contracts`. Query keys come from per-feature key factories. Mutations invalidate exactly the affected keys.
- **Local UI state:** component state first. Use a small Zustand store only for state that is genuinely shared across screens.
- **Forms:** react-hook-form plus a zod schema. Reuse the API's request schema from `packages/contracts` where possible, so client and server validate the same way.
- **Errors:** map API errors to user-facing messages in one place (`src/lib/api`). Never show raw server messages.

## Config and secrets
- Configuration lives in `app.config.ts`, read from `EXPO_PUBLIC_*` variables only. **Everything in the app bundle is public.** No server secrets, private keys or admin tokens ever go in the app. Third-party keys must be restricted (by bundle ID, package name or referrer).
- Per-environment API URLs: dev = `http://api.<slug>.<base>[:port]` (ADLC Traefik), prod = from `adlc.yaml environments`.
- Tokens live in **`expo-secure-store`** on native, never AsyncStorage. On web, prefer httpOnly cookies set by the API. If that's impossible, keep tokens in memory with a refresh flow.

## Platforms
- Branch with `Platform.select` / `Platform.OS` or `.web.tsx`/`.native.tsx` files. Every native-only module needs a web fallback, or a guard plus a disabled state.
- Plain HTTP is blocked by default on iOS (ATS) and on Android release builds. Dev builds may allow it for the dev API host only, through config plugins. Never allow it in production profiles.
- Native modules (anything needing `expo prebuild`) are **medium risk**. They require a new development build, so note that in the design.

## Accessibility and testability
- Every interactive element gets an `accessibilityLabel` (or visible text) and a **`testID`** following the pattern `<feature>-<element>[-<qualifier>]`, for example `booking-submit`. e2e tests select by `testID` (web: `data-testid` via `testID`).
- Respect dynamic type and the platform's minimum touch target size (44pt / 48dp). Contrast must meet WCAG AA.

## i18n and dates
- Every user-visible string goes through the i18n layer (keys per feature). Format dates and numbers with `Intl`. Store UTC and display in the user's timezone.

## Offline (when the PRD requires it)
- TanStack Query persistence for reads. Queue mutations with idempotency keys and replay them on reconnect. Make conflict rules explicit in the design.

## Builds and updates
- EAS profiles in `eas.json`: `development` (dev client), `preview` (internal testers), `production`. OTA updates (EAS Update) use one channel per environment. A change that needs a new native build must not ship as an OTA update.
- **Never** run `eas build`/`eas submit` from an agent session. Builds run in CI jobs that use the `release` environment.

## Review checklist (app)
- Web and native both handled; testIDs present; no secrets in config.
- Loading, empty and error states on every screen.
- Query invalidation correct; no unbounded lists without pagination or virtualisation (FlashList for long lists).
