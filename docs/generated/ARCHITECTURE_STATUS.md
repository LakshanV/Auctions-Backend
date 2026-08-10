# ARCHITECTURE STATUS

_Last updated: Phase 0 foundations._

## Style

Modular monolith with strict domain boundaries and a transactional outbox
(docs/03). No premature microservices. Apps are thin process hosts; domain logic
and contracts live in shared packages.

## Stack (current stable at implementation time — verify before pinning anew)

| Concern           | Choice                               |
| ----------------- | ------------------------------------ |
| Language          | TypeScript 5.7 (strict)              |
| Monorepo          | pnpm 9 workspaces + Turborepo 2      |
| Web / PWA         | Next.js 14.2 (App Router) + React 18 |
| API               | NestJS 10 + Express                  |
| Authoritative DB  | PostgreSQL 16 via Prisma 5           |
| Cache / queues    | Redis + BullMQ (optional in Phase 0) |
| Validation / DTOs | Zod (in `@singha/contracts`)         |
| Logging           | pino (secret-redacting)              |
| Tests             | Vitest (unit + integration)          |
| Lint / format     | ESLint 9 flat config + Prettier      |
| Lib bundling      | tsup (ESM + CJS + d.ts)              |

## Repository layout

```
apps/        web (Next.js) · api (NestJS) · worker (BullMQ) · live-console (placeholder)
packages/    contracts · domain · ui · auctionflow · config · observability · test-utils
database/    Prisma schema + migrations + client (@singha/database)
infrastructure/  docker-compose + native dev notes
docs/        the AI development pack (CLAUDE.md + docs/00..23) + docs/generated
```

## Domain boundaries

Declared as an acyclic manifest graph in `@singha/domain` (`boundaries.ts`) with
a test asserting the graph stays a DAG and dependencies precede dependents.
Modules communicate via commands/events, not by reaching into internals. Code
level import enforcement is deferred (DECISIONS D-0011).

## Data flow (target)

```
command -> domain aggregate -> state change + outbox event (same tx)
        -> outbox dispatcher (worker) -> internal event bus / adapters
        -> read models / notifications / analytics (rebuildable)
```

## Realtime

Server owns auction state; clients re-sync on reconnect. Realtime transport is a
later-phase adapter (WebSocket/SSE).

## Status

Phase 0 (foundations) and Phase 1 (stable data core) complete. Phase 1 added
the identity/seller/inventory/marketplace/media domain modules on the API,
server-side RBAC (JWT principal + global permission guard + ownership checks), a
transactional unit-of-work writing business change + outbox event + audit
atomically, versioned category schemas, and migration/upgrade-safety tests. Not
production-ready; Phase 2 (Timed Auction Engine) is next.

## API module structure (apps/api)

`shared/` (auth: principal middleware, JWT, permissions guard, `@RequirePermissions`,
`@CurrentActor`; persistence: `UnitOfWork`; validation: `ZodBody`; http: domain
exception filter) + `modules/` (identity, seller, inventory, marketplace, media,
dev). Domain rules and the boundary graph live in `@singha/domain`.
