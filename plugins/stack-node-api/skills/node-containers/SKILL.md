---
name: node-containers
description: Containerising and deploying the Node API (and static web) in ADLC projects. Covers the multi-stage Dockerfile, compose base and dev overrides, the Swarm prod stack (replicas, rolling updates, secrets, placement, health checks), migrations as a pre-deploy job, and image tags. Load when writing Dockerfiles, deploy/*.yml or anything about dev or prod deployment.
---

# Containers and deployment

Templates in `templates/`: `Dockerfile.api`, `compose.yml`, `compose.dev.yml`, `stack.prod.yml`, `predeploy.sh`.

## Images
- Multi-stage Dockerfile with targets `dev` (source-mounted, `tsx watch`) and `prod` (compiled, `pnpm deploy --prod`, `HEALTHCHECK` on `/healthz`).
- **Prod runs on `gcr.io/distroless/nodejs22-debian13:nonroot`** (build stages on `node:22-trixie-slim`, the same Debian 13), not a `node:*` image: no shell, apt, npm or corepack, so far fewer CVEs and the registry's "prevent vulnerable images" policy lets it be pulled (the publish workflow scans it first). Consequences: the entrypoint is node, so commands are script paths (`command: ["dist/migrate.js"]`, `CMD ["dist/main.js"]`); healthchecks use the exec form with `/nodejs/bin/node` (no `CMD-SHELL`, no `curl`; the base stage links that path so dev and test targets work too); the user is `nonroot` (65532): `COPY --chown=65532:65532` and an explicit `USER 65532:65532`. Native modules built in the Debian 13 build stage keep working (same glibc); never use an Alpine runtime with glibc-built modules. Measured on a real api image: `node:22-bookworm-slim` 262 findings (4 Critical, 71 High); distroless Debian 12 70 (1 Critical, libssl3); distroless Debian 13 31 (0 Critical, 0 High).
- `docker build --pull` in CI, so cached base images are never trusted. One image per deployable (`api`, `web`), tagged `sha-<7>` on every main build and `vX.Y.Z` on release. Never deploy `latest`.
- No secrets in images or build arguments.

## Compose files (one base plus overrides, same images everywhere)
- `deploy/compose.yml`: services, `image: ${REGISTRY_NS}/<name>:${IMAGE_TAG}`, health checks, internal networks. No ports.
- `deploy/compose.test.yml`: per-run test environment (`stack-react-native:rn-test-env`).
- `deploy/compose.dev.yml`: the dev environment on the dev server (pull-deployer): Traefik labels for `app.` / `api.${ADLC_PROJECT_DOMAIN}` on `adlc-web`, `NO_PROXY: "*"` on runtime services (unless one really calls an external API; then list internal names), Postgres and Redis with named volumes.
- `deploy/stack.prod.yml`: Swarm only (below). **`/deploy/` is in CODEOWNERS:** changes need the owner's review.

## Swarm prod stack
- `deploy:` per service: `replicas` from adlc.yaml; `update_config: { order: start-first, parallelism: 1, failure_action: rollback, monitor: 30s }`; `rollback_config`; `restart_policy`; resource `limits` and `reservations`.
- Stateful services (Postgres, Redis) are **pinned**: `placement.constraints: [node.labels.<slug>.postgres == true]`, named volume, `replicas: 1`, `order: stop-first`.
- Secrets are external Swarm secrets with versioned names (`<slug>_db_password_v1`), mounted as files, consumed via `X_FILE`. Rotate by creating `_v2` and updating the stack.
- Ingress: Traefik on the overlay network with Let's Encrypt (labels under `deploy.labels` in Swarm mode).
- **Deploys are human-run** on the manager with `adlc-swarm-deploy <owner/repo> <ref>` (several stacks: one call each with `--file deploy/stack.<name>.yml --stack <slug>-<name>`; stateful stacks pin images by digest). It only accepts commits on `main`, checks that every image exists, runs `deploy/predeploy.sh` (migrations), then runs `docker stack deploy --with-registry-auth`. No CI runner on the manager. Agents never deploy prod.

## Migrations before the update
`deploy/predeploy.sh` runs the migration as a one-off container from the **new** image, then exits non-zero on failure, which aborts the deploy before any service changes. See the template.

## Review checklist (deploy)
- Health checks on every service; start-first plus rollback on stateless services.
- Pinned, stop-first stateful services; secrets via `_FILE`; no `latest`.
- No published ports except Traefik; `/deploy/` change flagged for the owner's review.
