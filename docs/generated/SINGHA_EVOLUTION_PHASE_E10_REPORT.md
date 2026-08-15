# SINGHA EVOLUTION — PHASE E10 REPORT (Supply Programmes + perishable goods)

**Verdict: E10 PASS** — additive, behind the default-OFF `supplyProgrammes` / `perishableGoods`
flags. Baseline BE `3175dbe` → this phase. E10 adds the **recurring-availability** side of the
two-sided market (a commodity supplier posts standing availability once instead of re-listing) and
the **perishable-goods** specialist metadata for agricultural/food listings. The non-negotiable it
enforces: buyer↔supplier matching is a **recommendation only** — it awards nothing and binds nothing
(pack §09; consistent with DECISIONS **D4**, the same rule the E4 offer engine and E9 procurement
hold).

## Delivered

**Contracts** (`@singha/contracts` `supply-domains.ts`) — `supplyFrequencies`
(`daily`…`on_demand`), `supplyProgrammeStatuses` (`draft`/`active`/`paused`/`expired`/`withdrawn`),
`supplyPricingBases`; `createSupplyProgrammeSchema` (product, category, origin, decimal-string
available/min/max quantity + unit, frequency, pricing basis + integer-minor indicative price,
currency, packing, quality, Incoterm, validity window, lead time, operator);
`setSupplyProgrammeStatusSchema`; `recommendSupplySchema` (buyer demand criteria); the perishable
bundle — `perishableMetadataSchema` (harvest/packing/expiry dates, variety, grade, size, moisture %,
quality spec, cold chain, temperature range, phytosanitary/origin certs, quantities, shipment
window) + `attachPerishableSchema` (subject = `listing` | `supply_programme`). Quantities/moisture/
temperatures travel as **decimal strings, never floats** (D5); money is integer minor units.

**Pure domain engine** (`@singha/domain` `modules/supply`, 10 tests):

- `supply-programme.ts` — `SUPPLY_PROGRAMME_TRANSITIONS` + `assertSupplyProgrammeTransition`
  (`draft → {active,withdrawn}`, `active → {paused,expired,withdrawn}`, `paused → {active,expired,
withdrawn}`, `expired`/`withdrawn` terminal); `scaleDecimal` (float-free decimal→exact bigint,
  signed, precision-guarded); `assertOrderQuantities` (min ≤ max, non-negative);
  `isSupplyProgrammeOfferable` (active **and** inside the validity window); and
  `recommendProgrammes` — the heart of E10's "advisory only": it filters to offerable + matching
  programmes and ranks them cheapest indicative price first (nulls last, then lead time, then id),
  returning a **plain recommendation list that creates and binds nothing**.
- `perishable.ts` — `assertPerishableConsistent` (harvest ≤ packing ≤ expiry, ordered shipment
  window, moisture 0–100, tempMin ≤ tempMax → `InvariantViolation`/422); `perishableExpiresAt`
  (earliest of best-use date and shipment-window end); `isPerishableExpired` — the **automatic-
  expiry predicate** that lets a listing retire itself once past its date (pack: "Listings should
  support automatic expiry where appropriate").

**Schema** — two additive tables (`supply_programme`, `perishable_metadata`, the latter keyed by
`(subject_type, subject_id)` so it attaches to a listing **or** a programme **without mutating the
Listing table**); migration `20260815190000_evolution_e10_supply_perishable` is `CREATE TABLE` × 2 +
indexes + a unique index, **zero** DROP/RENAME/ALTER on existing tables. Money is `BigInt` minor
units; quantities `Decimal(38,9)`; temperatures `Decimal(6,2)`; moisture `Decimal(6,3)`.

**API** (`modules/supply`, flag-gated, `exchange:participate`) — a supplier
`POST /api/v1/supply/programmes` (draft, `min>max` refused 422), `POST .../programmes/:id/status`
(owner-only, transition-validated), `GET .../programmes/mine` + `GET .../programmes/:id` (owner). A
buyer `POST .../supply/recommend` returns `{ binding: false, recommendations: [...] }` ranked
cheapest-first. Perishable: `POST .../supply/perishable` upserts metadata for a subject the caller
is authorised for (programme = owner-gated; listing = existence + `exchange:operate`), and
`GET .../supply/perishable/:subjectType/:subjectId` returns the metadata + its live `expired` /
`expiresAt` status.

**Runtime flags** `supplyProgrammes` + `perishableGoods` (default **OFF**) across `@singha/config`
(3 files) + the DB `FeatureFlag` seed.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **175** tests (10 supply) +
  `@singha/contracts` 25 + `@singha/api` **49** (2 supply flag-gating specs) + `@singha/config` 14;
  `lint` **0 errors** (pre-existing e2e-script warnings only); `format:check` clean. Real-Postgres
  E2E `scripts/e2e-supply.mjs` (wired into `test:supply` + the acceptance chain + a CI step) proves:
  a supplier posts a programme (draft); `min>max` → 422; activation (draft→active); a **withdrawn →
  active** transition → 409; a non-owner **manage → 403**; buyer matching is **advisory
  (`binding:false`)**, ranks cheapest-first, and **excludes** the draft/over-minimum programmes;
  anonymous denied; perishable attach with a **future** best-use date → not expired; upsert to a
  **past** date → **automatically expired**; `harvest>packing` → 422; a non-owner attach → 403; an
  unknown subject → 404; and the DB confirms the live/withdrawn statuses and a single upserted
  metadata row.
- **Never auto-award (§09 / D4):** `recommendProgrammes` returns a pure list; there is no award/
  accept path in E10 at all — matching only surfaces candidates for a human to act on.
- **Server-side authorisation (rule 9):** programme management and perishable attach are ownership-
  gated (non-owner 403); the whole surface 404s while its flag is OFF (unit specs).
- **Money/decimal integrity (D5/D6):** quantities/temperatures/moisture are exact `scaleDecimal`
  bigint comparisons; indicative price is integer minor units; no float, no LLM.
- **Migration safety:** additive-only (two new tables); the Listing table is untouched — perishable
  metadata attaches by `(subjectType, subjectId)` reference.

## Owner actions (non-blocking)

- None specific to E10. A programme can generate listings/offers and matching can recommend
  counterparties, but any resulting binding transaction still flows through the owner-gated E6/E8
  engines (routing/terms/payment) and remains non-binding until verified.

## Next

**E11** — Singha ID extensions + unified Dashboard + Admin Control Centre.
