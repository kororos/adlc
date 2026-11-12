---
name: e2e-patterns
description: How ADLC writes and runs end-to-end tests for the Expo app. Playwright for web, Maestro for Android (shared emulator in the project's Docker sidecar) and iOS (CI on macOS), with selectors, waits, tags, the emulator lock, artifacts and flake avoidance. Load when writing, running or debugging e2e tests.
---

# E2E patterns (web: Playwright · Android/iOS: Maestro)

The scheduling, selection and flake rules come from the core `testing-contract` skill. This skill covers how to do it with these tools.

## Common rules
- **Gating runs use the prod-like build** (`env.start_build`): exported web bundle, release APK. Never gate against the dev server or Metro.
- One flow per acceptance criterion or user journey. Name it after the AC, e.g. `AC3-cancel-late-shows-policy`. Tag critical journeys `@smoke`.
- Select by **testID** only (`getByTestId` / `id:`). Never select by CSS classes, layout, or translated text unless the text itself is under test.
- Never sleep. Wait for a visible state, such as an element, URL or network idle, with a timeout.
- Each flow creates its own data through the API or seed helpers (unique per run, e.g. an email with `$ADLC_RUN`). Flows must not depend on each other or on execution order.
- Keep artifacts (trace, video, screenshots) only on failure, under `.adlc/runs/<n>/reports/artifacts/`.

## Web: Playwright
- Location: `apps/app/e2e/web/*.spec.ts`. `baseURL` comes from `E2E_BASE_URL`, which the test environment sets to `http://<run>.app.<slug>.<base>[:port]` or to the internal service URL.
- Config: `retries: 0` locally (the contract handles retries), `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`, and `grep` for `@smoke`.
- Browsers: chromium only per run. The full browser matrix runs nightly.
- Run: `pnpm --filter app exec playwright test --grep @smoke` (smoke) or with a spec list (affected).

## Android: Maestro and the shared emulator
- Flows: `apps/app/e2e/flows/*.yaml`, `appId` from `app.config.ts`. Use `tags: [smoke]` for smoke flows.
- The emulator is a **long-lived service** in the project's Docker sidecar (compose project `adlc-emulator`, template in the `rn-test-env` skill). It is shared by all runs, so **always hold the lock**, but only around the emulator part (connect, install, flows): **build the APK first, outside the lock**. A build of 10 to 20 minutes inside the lock blocks every other run's Android QA:
  ```bash
  flock "$ADLC_LOCK_DIR/android-emulator.lock" bash -c '
    for _ in $(seq 1 180); do   # adb connect fails silently while the emulator still boots: retry it
      adb connect emulator:5555 >/dev/null 2>&1
      [ "$(adb -s emulator:5555 shell getprop sys.boot_completed 2>/dev/null | tr -d "\r")" = 1 ] && break
      sleep 5
    done &&
    adb -s emulator:5555 install -r apps/app/android/app/build/outputs/apk/release/app-release.apk &&
    maestro --device emulator:5555 test apps/app/e2e/flows --include-tags smoke'
  ```
- Build the APK for the emulator's ABI only (`./gradlew assembleRelease -PreactNativeArchitectures=x86_64`): much faster, far less disk. On the shared dev server, don't build while the emulator boots (memory).
- **Rebuild natively only when native code changed.** Store the native fingerprint (`npx @expo/fingerprint fingerprint:generate`, hash only) next to the build. Same fingerprint and an existing `android/`: skip `expo prebuild` (never `--clean`) and run Gradle incrementally, which only re-bundles the JavaScript and repackages (minutes instead of 10 to 20). A different fingerprint: `expo prebuild --clean` and a full build. Turn on the Gradle build cache (`org.gradle.caching=true`). Skip `adb install` when the installed APK's hash is the same.
- **Run the selection, not everything.** The e2e script takes the flows to run (tags or a list, e.g. `E2E_FLOWS`): per run, smoke plus the flows the change affects; nightly and CI run all. Flows that consume seeded state reseed only the seed data they use, not the whole test seed.
- Install the **release APK** built by `env.start_build`, and uninstall or clear app data before each run (`clearState: true` in flows).
- Common failures:
  - `device offline`: run `adb reconnect`, then retry once.
  - Emulator not booted: check `getprop sys.boot_completed`. If the container is unhealthy, recreate it (`up -d --force-recreate`, see `rn-test-env`), never `docker restart` it.
  - The app shows "offline" or can't resolve the API host, and the emulator log has `HTTP proxy handshake … 403`: the emulator service lacks the empty `HTTP_PROXY`/`http_proxy`/`HTTPS_PROXY`/`https_proxy` of the `rn-test-env` template. Fix `deploy/compose.emulator.yml` and recreate it.
  - In all these cases report **environmental**, not a test failure.

## iOS
- Same Maestro flows, run only in CI on `macos-latest` (`where: ci`). Don't add iOS-only flows unless an AC is iOS-specific. Use `runFlow` with `when: platform` for small differences.

## Writing a good flow (Maestro)
```yaml
appId: ${APP_ID}
tags: [smoke]
---
- launchApp: { clearState: true }
- tapOn: { id: "auth-email" }
- inputText: "e2e-${ADLC_RUN}@example.test"
- tapOn: { id: "auth-submit" }
- assertVisible: { id: "home-title" }
```

## Exploratory QA (when enabled)
- Web: drive the running preview URL with the browser automation tools. Read the accessibility tree, and take screenshots only when the layout itself is in question.
- Android: through `adb` (`uiautomator dump`, `input tap/text`) under the emulator lock, at most 15 actions.
