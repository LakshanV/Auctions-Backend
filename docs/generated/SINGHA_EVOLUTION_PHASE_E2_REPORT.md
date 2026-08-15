# SINGHA EVOLUTION — PHASE E2 REPORT (Config Foundations)

**Verdict: PASS (E2 complete — config foundations + flag-gated read surfaces).** Additive
backend, every new capability behind default-OFF flags; no existing table or route changed.
Baseline BE `f1676fbe` → this phase. Delivered in two increments (E2a data/taxonomy, E2b HTTP
surfaces).

## E2a — data + taxonomy foundation

**Additive schema** (`database/prisma/schema.prisma`) — 8 new config-only tables + 4 enums, no
change to any existing table: `unit_definition`, `sale_method_definition`, `market`, `operator`,
`operator_market`, `location`, `market_node`, `market_node_operator` (enums `UnitKind`,
`OperatorType`, `ConfigVerification`, `MarketNodeMode`). Owner/legal-gated config
(`Operator`/`MarketNode`) carries `verification = draft` (DECISIONS D7). Per Addendum A these are
**config resolved at request time, not per-country ledgers**.

**Migration** — `migrations/20260815090000_evolution_e2_config_foundations/migration.sql`,
generated via `prisma migrate diff`. Verified **additive-only**: 4 `CREATE TYPE`, 8 `CREATE TABLE`,
FK `ALTER TABLE`s touch only the new tables, **zero** DROP/RENAME.

**Canonical taxonomy in `@singha/contracts`** (`config-domains.ts`) — one source of truth:
`SALE_METHOD_DEFINITIONS` (17; the 6 legacy-enum-backed methods active, neutral offer/procurement
methods defined-but-inactive for E4/E9) and `UNIT_DEFINITIONS` (19) as typed constants + zod
schemas; the DB seed **imports** them so seed/domain/contracts never drift.

**Pure domain logic** (`@singha/domain` `platform/sale-methods.ts`) — query surface + guardrail for
**D3** (every legacy `SaleMethod` enum value maps 1:1 to an active code) and **D4** (no offer/sealed
method binds automatically). 6 unit tests.

**Runtime flags** (`@singha/config`, 3 edits) + DB seed flags: `multiOperator`,
`structuredLocations`, `quantityUnits`, `saleMethodConfig` — all **default OFF**.

## E2b — flag-gated read surfaces + real-DB test

**`platform-config` NestJS module** (`apps/api/src/modules/platform-config/`) — public, read-only,
each endpoint gated by its own default-OFF flag (404 until enabled), under `/api/v1/platform`:
`GET sale-methods` (`saleMethodConfig`), `GET units` (`quantityUnits`), `GET markets` /
`operators` / `nodes` (`multiOperator`). Static taxonomy is served from the canonical contracts
constants; instance config from the **one central authoritative DB** (Addendum A). Operator legal
identity is never returned (public-safe projection, D7). Registered in `app.module.ts`.

**Controller unit test** (`.controller.spec.ts`, 3 tests) — asserts each surface 404s when its flag
is OFF, serves data when ON, and that the flags gate independently.

**Real-Postgres integration test** (`database/src/config-domains.integration.test.ts`) — under the
ephemeral-DB harness (`pnpm test:db`): all 8 tables migrated + queryable; a market→operator→node
graph persists with relations; owner-gated defaults hold (`operator.verification = draft`,
`legalName = null`; node `mode = DISCOVERY`, all local-commerce capabilities off); the unique
operator-code constraint is enforced. Skips when no `DATABASE_URL`.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13 (regenerates the Prisma client → the seed +
  integration test typecheck against the new models); `@singha/domain` 96/96 + `@singha/api` 24/24
  (incl. 3 new); `lint` 0 errors (3 pre-existing e2e-script warnings); `format:check` clean in both
  repos (vendored pack Prettier-ignored).
- **Migration safety:** additive-only, existing tables untouched, FKs `ON DELETE RESTRICT`/`SET NULL`.
- **Invariants encoded as tests:** D3 (legacy 1:1), D4 (offers never auto-bind), D7 (draft default),
  Addendum A (Discovery + capabilities-off default; central store).
- **Confidentiality:** operator legal identity never exposed on the public read; no secrets.

## Not run locally / deferred

- **Real-Postgres apply + seed** and **`contract:check`** (boots the API) need Postgres server
  binaries absent from this env; they run in CI via the ephemeral-DB harness. The migration is
  Prisma-generated (valid by construction); the new integration + controller tests exercise the
  path. No public contract endpoint (the emitted 5) changed, so `contract:check` is a no-op pass.
- **Frontend consumption** of the sale-method/unit endpoints is deferred to E3/E11 (the FE catalogue
  already renders sale methods via existing facets; nothing regresses).

## Next

**E3 — Universal Listing evolution** (additive): quantity + unit columns, structured-location role
FKs (asset/seller/custodian/pickup/export-origin/destination), `listing.sale_method_code` alongside
the enum with backfill, and operator / origin-node attribution — the last additive step before the
headline **E4 Commercial Offer Engine V2**.
