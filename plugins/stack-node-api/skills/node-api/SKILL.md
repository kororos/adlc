---
name: node-api
description: Conventions for the Node.js/TypeScript API in ADLC projects. Covers module layout, HTTP layer, validation and OpenAPI contracts, errors, auth, config, logging, health endpoints, graceful shutdown, rate limiting and testing. Load before designing, implementing, reviewing or debugging API code.
---

# Node API conventions

These are defaults. Accepted ADRs override them. Check library APIs with Context7 before you use anything version-sensitive.

## Layout
```
apps/api/src/
  main.ts                 bootstrap: config → logger → db/redis → server → graceful shutdown
  modules/<module>/       routes.ts (HTTP) · service.ts (logic) · repo.ts (data) · schemas.ts · *.test.ts
  lib/                    config, errors, auth, db, redis, http plugins
packages/contracts/       zod schemas → OpenAPI → shared types for the app
```
- Dependencies point one way: routes → service → repo. Modules talk to each other only through another module's `service` exports. `arch_check` (dependency-cruiser) enforces this.
- Default stack, unless an ADR says otherwise: **Fastify**, **zod** schemas (via a type provider), **OpenAPI** generated from the schemas, **pino** logging.

## HTTP and contracts
- Every route declares request and response schemas. Validate at the boundary and never trust input further in.
- Version the API (`/v1`). Mobile clients stay on old versions for months, so breaking changes need a new version or an additive path. Removing a field is a high-risk change.
- Paginate lists with cursors (`?cursor=&limit=`, with a maximum limit). Never return unbounded lists.
- Use one error shape everywhere: `{ error: { code, message, details? } }` with stable `code`s. Map domain errors to HTTP status in one place. Never leak stack traces or SQL.

## Auth and security
- Authenticate in a plugin and authorise **in the service layer**. Check object ownership (IDOR) on every read and write by ID.
- Hash passwords with argon2id. Use short-lived access tokens plus rotating refresh tokens, or server sessions in Redis. Web clients get httpOnly, Secure, SameSite cookies.
- Rate-limit auth and expensive endpoints (Redis store). Set CORS to an explicit origins list from config.

## Config, secrets, logging
- All config comes from environment variables, validated by a zod schema at startup (fail fast). A secret `X` may come from `X_FILE` (Docker or Swarm secrets mounted as files). Support both.
- Structured pino logs with a request ID and no PII or secrets: redact `authorization`, `cookie`, `password` and tokens.

## Operability
- `GET /healthz` is liveness (no dependencies). `GET /readyz` is readiness (database and Redis reachable). Container health checks use `/healthz`, Swarm and Traefik use `/readyz`.
- Graceful shutdown on SIGTERM: stop accepting connections, finish in-flight requests (≤ 25 s), close pools.
- Don't run migrations on app start in prod. They run as a separate job (`stack-node-api:postgres-redis`).

## Testing
- Unit-test services with fakes. **Integration tests** hit the real Postgres and Redis from the test environment, through the HTTP layer (`fastify.inject`). Each test owns its data (transaction rollback or unique IDs).
- Contract tests check that the generated OpenAPI is unchanged unless intended (snapshot reviewed in the PR).

## Review checklist (API)
- Authorisation at object level; input schemas on every route; pagination.
- Errors mapped; no N+1 queries (check repo calls inside loops).
- Health endpoints intact; config added to the zod schema and `.env.example`.
