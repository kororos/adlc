---
name: web-containers
description: Containerising and running a React + Vite SPA in ADLC projects. Covers the multi-stage Dockerfile (vite dev target, unprivileged nginx prod target), the nginx template with runtime /config.json, security and cache headers, same-origin /api routing through Traefik, watch and build modes in the per-run test environment, the dev environment and the Swarm prod service. Load when writing the web Dockerfile, nginx config, deploy/*.yml for the web app, or adlc.build.yaml start commands.
---

# Web app containers and environments

Templates in `templates/`: `Dockerfile.web`, `default.conf.template`, `compose.web.test.yml`, `compose.web.dev.yml`. They follow the runner rules in `stack-react-native:rn-test-env` / `stack-node-api:node-containers` (same paths, `NO_PROXY: "*"` at runtime, Traefik on `adlc-web`, no host ports, `${ADLC_RUN}` in every per-run name).

## Image
- One Dockerfile per web app, two targets:
  - `dev`: dependencies only, runs `vite` with the worktree bind-mounted over `/repo` (watch mode, HMR).
  - `prod`: `vite build` output in **`nginxinc/nginx-unprivileged`** (non-root, port 8080), `HEALTHCHECK` on `/healthz`.
- Both listen on **8080**, so compose files and Traefik labels are the same in both modes.
- `docker build --pull` in CI; tags `sha-<7>` and the release version (`stack-node-api:node-containers`). No secrets or environment values in the image.

## nginx (`default.conf.template`)
- Rendered at container start by the image's envsubst step from `WEB_*` variables (defaults set in the Dockerfile).
- `/config.json` is generated from `WEB_API_BASE_PATH` and `WEB_ENVIRONMENT` (add keys there and in `runtime-config.ts` together). `Cache-Control: no-store`.
- `/assets/*` (hashed): one-year immutable cache. `index.html` and SPA routes: `no-cache`, `try_files … /index.html`.
- Headers: CSP from `WEB_CSP` (strict default: same-origin scripts, API and fonts; widen it per environment for e.g. an object-storage origin in `img-src`, never with `unsafe-eval`), `X-Content-Type-Options`, `Referrer-Policy`. nginx doesn't inherit `add_header` into locations that set their own, so repeat them there.
- A second entry (e.g. a small public bundle on another host) is a Vite multi-page build (`build.rollupOptions.input`) plus a second `server` block selected by `server_name`.

## Same-origin API routing
- `app.<domain>/api/*` → the API (prefix stripped by a Traefik middleware), everything else → `web`. The API's own host can stay for other clients (mobile).
- In the test env the routers are named `r${ADLC_RUN}-…`; in dev `dev-…`; in prod (Swarm) the labels go under `deploy.labels` with the prod host and Let's Encrypt (`stack-node-api:node-containers`).
- Traefik prefers the longer rule, so `Host && PathPrefix(/api)` wins over `Host` without explicit priorities.

## Modes (adlc.build.yaml)
- `start_watch`: `ADLC_MODE_TARGET=dev` → vite dev server; `vite.config.ts` allows `.${ADLC_PROJECT_DOMAIN}` hosts and sends HMR to `ADLC_EDGE_PORT`, so `http://<run>.app.<slug>.<base>[:port]` hot-reloads through the edge.
- `start_build`: `ADLC_MODE_TARGET=prod` → the real nginx image. **Gating e2e runs against this mode**, so headers, CSP and runtime config are tested as shipped.
- Switch modes with `env.down` → `env.up` → `env.seed` → the other start command.

## Dev and prod
- Dev (pull-deployer, prod image): merge `compose.web.dev.yml` into `deploy/compose.dev.yml`.
- Prod (Swarm): the `web` service is stateless: `replicas` ≥ 2, `update_config: { order: start-first, failure_action: rollback }`, health check, and Traefik labels under `deploy.labels`. It needs no secrets.

## Review checklist (web containers)
- Both targets build; prod runs as non-root on 8080 with a health check.
- No environment values baked into the bundle; `/config.json` keys match `runtime-config.ts`.
- CSP not widened without a reason; cache headers intact (`index.html` no-cache, assets immutable).
- `/deploy/` changes flagged for the owner's review.
