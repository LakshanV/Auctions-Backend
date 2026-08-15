# SINGHA EVOLUTION — PHASE E2 REPORT (Config Foundations)

**Verdict: PASS (increment 1 — data + taxonomy foundation).** Additive backend, all new
capability behind default-OFF flags. Baseline BE `f1676fbe` → this phase. The HTTP read
surfaces + Operator/Node admin are increment 2 (see "Remaining in E2").

## Scope delivered (increment 1)

**Additive schema** (`database/prisma/schema.prisma`) — 8 new config-only tables + 4 enums, no
change to any existing table: `unit_definition`, `sale_method_definition`, `market`, `operator`,
`operator_market`, `location`, `market_node`, `market_node_operator` (enums `UnitKind`,
`OperatorType`, `ConfigVerification`, `MarketNodeMode`). Owner/legal-gated config
(`Operator`/`MarketNode`) carries `verification = draft` (DECISIONS D7). Per Addendum A these are
**config resolved at request time, not per-country ledgers**.

**Migration** — `migrations/20260815090000_evolution_e2_config_foundations/migration.sql`,
generated via `prisma migrate diff` (Postgres server tooling isn't available in this env, so the
ephemeral-DB harness can't run here). Verified **additive-only**: 4 `CREATE TYPE`, 8
`CREATE TABLE`, FK `ALTER TABLE`s touch only the new tables, **zero** DROP/RENAME.

**Canonical taxonomy in `@singha/contracts`** (`config-domains.ts`) — one source of truth:
`SALE_METHOD_DEFINITIONS` (17: the 6 legacy-enum-backed methods active + neutral offer/procurement
methods defined-but-inactive for E4/E9) and `UNIT_DEFINITIONS` (19 units) as typed constants +
zod schemas; the DB seed now **imports** them so seed/domain/contracts never drift.

**Pure domain logic** (`@singha/domain` `platform/sale-methods.ts` + test) — the query surface and
guardrail for the two non-negotiables: **D3** (every legacy `SaleMethod` enum value maps 1:1 to an
active definition code) and **D4** (no offer/sealed method binds automatically). 6 unit tests.

**Runtime flags** (`@singha/config`, 3 edits: interface/env/mapping) + DB seed flags:
`multiOperator`, `structuredLocations`, `quantityUnits`, `saleMethodConfig` — all **default OFF**.

## Self-review (pack 13)

- **Format / lint / typecheck / build / tests:** `format:check` clean (vendored pack
  Prettier-ignored; status docs formatted); `lint` 0 errors (3 pre-existing e2e-script warnings);
  `turbo typecheck` 13/13 (regenerates the Prisma client → the seed typechecks against the new
  models); `turbo build` 7/7; `@singha/domain` **96/96** tests (incl. 6 new).
- **Migration safety:** additive-only confirmed by inspection (no DROP/RENAME); existing tables
  untouched; new FKs `ON DELETE RESTRICT`/`SET NULL`.
- **Invariants encoded as tests:** D3 legacy 1:1 mapping; D4 offers never auto-bind; auctions bind;
  unknown codes safe-default to non-binding.
- **Secrets:** none.

## Not verified locally / deferred

- **Real-Postgres apply + seed** and **`contract:check`** (boots the API) can't run here (no
  Postgres server binaries); they run in CI via the ephemeral-DB harness. Migration is
  Prisma-generated (valid by construction) and the seed typechecks against the regenerated client.
- **Remaining in E2 (increment 2):** flag-gated HTTP read endpoints (`GET /platform/sale-methods`,
  `/units`, `/markets`, `/operators`, `/nodes`) via a NestJS `platform-config` module; `Permission`
  entries + RBAC for any admin write; a `*.integration.test.ts` in `@singha/database` asserting the
  new tables + seeded rows; frontend consumption of the sale-method/unit contracts.

## Next

Finish E2 increment 2 (read surfaces + integration test), then **E3** (Universal Listing
evolution: quantity/unit columns, structured-location role FKs, `listing.sale_method_code`
alongside the enum, operator/origin-node attribution) — the additive path that unblocks **E4
Offer Engine V2**.
