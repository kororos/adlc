---
name: rn-test-env
description: Templates and rules for the React Native + Node test and dev environments in the ADLC runner. Covers adlc.build.yaml commands, compose files (test/dev) with the egress-proxy and Traefik rules, the shared Android emulator service, and watch versus build modes. Load when creating or changing adlc.build.yaml, deploy/compose*.yml or the walking skeleton.
---

# React Native test and dev environments

Templates live in `templates/` next to this file. Copy and adapt them; don't reinvent them. They encode the runner's rules:
- **Same paths:** bind mounts only under `$ADLC_ROOT/projects/<slug>/` (identical in the runner and the Docker sidecar).
- **Egress:** runtime services set `NO_PROXY: "*"` / `no_proxy: "*"`. Builds keep the injected proxy.
- **Preview URLs:** web-facing services join the external network `adlc-web` with Traefik labels for `${ADLC_RUN}.app.${ADLC_PROJECT_DOMAIN}` / `${ADLC_RUN}.api.…`.
- **Isolation:** every per-run project name contains `${ADLC_RUN}`. Never publish host ports (`ports:`); use Traefik or the compose network.

| Template | Becomes | Purpose |
|---|---|---|
| `adlc.build.yaml` | `/adlc.build.yaml` | commands, env lifecycle, e2e targets |
| `compose.test.yml` | `deploy/compose.test.yml` | per-run: Postgres, Redis, API (watch/build), web, mock server |
| `compose.emulator.yml` | `deploy/compose.emulator.yml` | the shared Android emulator (one per project) |

## Modes
- `start_watch`: API with `tsx watch` and the source mounted; web via Expo dev server (`expo start --web`); Android dev client loading JS from Metro.
- `start_build`: compiled API (`node dist/main.js`), web via `expo export --platform web` served statically, Android release APK built with `expo prebuild` plus Gradle in the runner (cached in `$ADLC_ROOT/cache/gradle`).
- Switch modes with `env.down` → `env.up` → `env.seed` → the other start command.

## Android emulator
- Started once by `env.up` if not running: `docker compose -p adlc-emulator -f deploy/compose.emulator.yml up -d`. It needs `/dev/kvm`, which the runner passes to the sidecar when the host has it. If `/dev/kvm` is missing, mark Android e2e as `where: ci`.
- Reach it at `emulator:5555` on network `adlc-web`. Optional live view (noVNC) at `http://emulator.<slug>.<base>[:port]`.
- Always use it under `flock "$ADLC_LOCK_DIR/android-emulator.lock"` (see `e2e-patterns`).

## Walking-skeleton checklist (environments)
1. `deploy/compose.yml` (base), `compose.test.yml`, `compose.dev.yml`, `compose.emulator.yml`, `stack.prod.yml` (with `stack-node-api:node-containers`).
2. `adlc.build.yaml` from the template, with every command proven to run in the runner, then `status: active` (CI only runs its jobs from then on).
3. Root scripts: `adlc:dev` (watch), `adlc:prodlike` (build), `arch:check`.
4. CI workflows from `adlc-core:ci-workflows`: setup already installed the bootstrap versions; adapt them so every job passes for real with `status: active`.
