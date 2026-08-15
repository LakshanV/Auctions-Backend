# SINGHA EVOLUTION — PHASE E3 REPORT (Universal Listing)

**Verdict: PASS (E3 — the expand step).** Additive: existing consumers are untouched and keep
reading the `SaleMethod` enum + flat location; the new columns are populated (backfilled +
dual-written) and consumed in a later phase. Baseline BE `8db9907` → this phase.

## Scope delivered

**Additive `Listing` columns** (`schema.prisma`) — all nullable, so every existing row stays
valid:

- `sale_method_code` — the configurable sale-method code alongside the enum (D3).
- Quantity/unit engine (D5, pack doc 13): `quantity_available` / `min_order_quantity` as
  **`Decimal(38,9)`** (never float), `quantity_unit_code`, `pricing_basis`, `unit_price_minor`
  (BigInt minor units).
- Six **structured-location role FKs** (pack doc 15): asset / seller / custodian / pickup /
  export-origin / destination → `location` (each a distinct place; never assumed equal).
- **Operator + origin-node attribution** (Addendum A — origination is attribution on the one
  central record, not ownership): `operator_id` → `operator`, `origin_node_id` → `market_node`.
- Back-relations added to `Location` (6 named), `Operator`, `MarketNode`; indexes on
  `operator_id` + `origin_node_id`.

**Migration** — `20260815100000_evolution_e3_universal_listing`: 14 `ADD COLUMN`, 8 FK
(`ON DELETE SET NULL`), 2 indexes, **zero** DROP/RENAME, plus a **backfill**
`UPDATE listing SET sale_method_code = sale_method::text WHERE sale_method_code IS NULL`
(idempotent; enum→text label equals the definition code for legacy methods).

**Dual-write** (`marketplace.service.ts`) — new listings set `sale_method_code` via the domain
helper `saleMethodCodeForLegacyEnum(saleMethod)`, so post-migration rows match the backfill. The
enum stays authoritative until a later phase switches consumers over.

**Contracts** (`listing-domains.ts`) — `pricingBases`, `locationRoles`, and an additive
`listingCommercialSchema` (Decimal quantities as strings on the wire; money in minor units).

**Domain** (`platform/sale-methods.ts`) — `saleMethodCodeForLegacyEnum` + test.

## Self-review (pack 13)

- **Migration safety:** additive-only (no DROP/RENAME/type-change on existing columns); the only
  data change is a NULL-guarded backfill of a brand-new column. Schema `prisma validate` clean.
- **Gates:** `turbo build` 7/7; `typecheck` 13/13 (regenerated Prisma client; dual-write +
  integration test typecheck against the new columns); `@singha/domain` 97 + `@singha/contracts`
  25 tests; `lint` 0 errors; `format:check` clean.
- **Real-Postgres integration test** (`database/src/listing-universal.integration.test.ts`, runs
  under `pnpm test:db`) — a listing persists with `sale_method_code`, Decimal quantity
  (round-trips exactly), pricing basis, unit price, two location roles and operator/node
  attribution; relations read back correctly. Skips without `DATABASE_URL`.
- **Consumer safety:** the contract-checked catalogue-v2 response is unchanged (still reads the
  enum + flat location), so `contract:check` stays a no-op pass; nothing regresses.

## Deferred

- **Decimal quantity/price arithmetic** (per-unit × quantity = total) lands with the Offer Engine
  (E4), where it's actually used — kept out of E3 to avoid unused money math.
- **Consumers switching** to `sale_method_code` + structured location (catalogue/lot/FE) is a
  later contract step once the offer/routing phases need it.

## Next

**E4 — Commercial Offer Engine V2** (highest functional priority): `Offer` + immutable
`OfferRevision` carrying full commercial terms (price/qty/unit/Incoterm/delivery/payment),
counter = new revision, confidentiality, and **sealed = `MANUAL_SELECTION`** (D4) — built on the
E2 taxonomy + E3 listing columns now in place.
