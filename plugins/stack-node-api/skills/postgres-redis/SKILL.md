---
name: postgres-redis
description: Data-access rules for Postgres and Redis in ADLC Node projects. Covers schema design, migrations (expand/contract, safe locking, prod migration job), transactions, test data and seeding, connection pools, and Redis usage (cache, sessions, rate limits, queues) with TTLs. Load when changing the schema, writing queries or migrations, or using Redis.
---

# Postgres and Redis

## Schema and migrations
- One migration tool for the whole repo (default **Drizzle** with SQL migrations, unless an ADR says otherwise). Migrations are plain, reviewed SQL files committed with the code. Never edit an applied migration.
- **Expand → migrate → contract.** Mobile clients and rolling updates mean old and new code run at the same time:
  1. *Expand:* add nullable columns or new tables, backfill in batches.
  2. Deploy code that writes both shapes and reads the new one.
  3. *Contract:* drop the old shape in a later release.
- Safe DDL:
  - `CREATE INDEX CONCURRENTLY` (in its own migration, outside a transaction);
  - add `NOT NULL` via a `CHECK … NOT VALID` constraint, then `VALIDATE`;
  - never rewrite a large table in one statement;
  - set `lock_timeout` (for example 5 s) in migrations.
- Every migration has a tested down path, or states in the PR why it's irreversible (that makes the change high risk).
- **Prod:** migrations run as a one-off job *before* the rolling update (`deploy/predeploy.sh` on Swarm) using the same image (`node dist/migrate.js`). Dev and test run `db:migrate` explicitly.

## Queries and transactions
- Parameterised queries only, never string-built SQL. Keep all data access in `repo.ts`.
- Use explicit transactions for multi-statement invariants. Keep them short and do no network calls inside.
- Avoid N+1: batch by IDs (`WHERE id = ANY($1)`) or join. Every list query is paginated and indexed on its sort key.
- Store timestamps as `timestamptz` (UTC) and money as integers or `numeric`. Use `uuid` (v7) primary keys for anything exposed by the API.

## Pools
- One pool per process, size from config (default 10). Readiness fails if the pool can't connect. Close the pool on shutdown.

## Test data
- `db:seed:test` is deterministic and idempotent. Tests create their own rows with unique values, so runs never depend on shared state. The test database uses tmpfs, so every environment starts empty.

## Redis
- Prefix every key by purpose and version: `app:v1:<purpose>:<id>`. **Every key gets a TTL** except explicitly durable ones (document them in the design).
- Uses:
  - cache-aside with explicit invalidation on writes;
  - sessions and refresh-token stores (TTL = session lifetime);
  - rate limits;
  - background jobs with BullMQ: idempotent handlers, retries with backoff, dead-letter handling.
- Never use Redis as the system of record for user data unless an ADR accepts the durability trade-off. In prod Swarm it's a pinned service with AOF if it's used for anything beyond cache.

## Review checklist (data)
- Migration is expand/contract-safe and lock-safe; index for new query patterns.
- No unbounded queries; Redis keys have TTLs and prefixes.
- Transactions are short; seed data is updated.
