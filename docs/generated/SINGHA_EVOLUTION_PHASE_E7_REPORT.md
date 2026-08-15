# SINGHA EVOLUTION — PHASE E7 REPORT (Logistics / Ports / Incoterms)

**Verdict: E7a PASS** (Incoterms + logistics config + the deterministic quote engine). Additive,
behind the default-OFF `logistics` flag. Baseline BE `f6feb43` → this phase. The booking + shipment
lifecycle is **E7b** (see "Remaining"). Live provider quotes await owner register O6; a
credential-free fake supplies deterministic estimates so nothing is blocked.

## E7a delivered

**Contracts** (`@singha/contracts` `logistics-domains.ts`):

- `INCOTERMS` (EXW/FCA/FOB/CFR/CIF/DAP + future) with `sellerBearsFreight` / `sellerBearsInsurance`
  indicators; `logisticsNodeKinds` (PORT/AIRPORT/INLAND_DEPOT/PICKUP_SITE); `transportModes`;
  `freightArrangers` (buyer/seller/singha); `quoteStatuses`.
- `quoteRequestSchema` / `quoteResultSchema` — an instant estimate with persisted assumptions +
  expiry.

**Pure domain engine** (`@singha/domain` `modules/logistics`, 7 tests):

- `resolveFreightArranger` — an explicit choice wins; otherwise the Incoterm decides (CIF→seller,
  FOB→buyer).
- `estimateFreightMinor` — `base rate × chargeable units × zone multiplier` in exact **integer
  minor-unit bigint** with half-up rounding; never a float (D5/D6). `zoneMultiplierBps` is a
  deterministic same-country / cross-border / unknown stand-in until a provider supplies zones.
- `isQuoteFresh` / `canBookQuote` — a quote carries a freshness window and is **not** a booking;
  only a fresh, not-yet-accepted quote may be booked (E7b consumes this).

**Provider adapter** (`apps/api` `modules/logistics/logistics.provider.ts`) — `LogisticsProvider`
interface + `LOGISTICS_PROVIDER` token; a deterministic, credential-free `FakeLogisticsProvider`
that records its assumptions (explainable + reproducible). A real carrier/aggregator drops in when
owner O6 lands — swap the binding, nothing else changes.

**Schema** — three additive tables (`logistics_node`, `logistics_provider`, `logistics_quote`);
migration `20260815140000_evolution_e7_logistics` is `CREATE TABLE` × 3 + indexes, **zero**
DROP/RENAME/ALTER.

**API** (`modules/logistics`, flag-gated `logistics`) — `GET /api/v1/logistics/incoterms` +
`/nodes` (public reference), `POST /api/v1/logistics/quotes` + `GET /quotes/:id`
(`exchange:participate`). A quote persists its assumptions/provider/expiry; it is an estimate, never
a booking.

**Runtime flags** `logistics` / `logisticsQuotes` (default **OFF**) across `@singha/config`
(3 files) + the DB `FeatureFlag` seed.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **143** tests (7 logistics) +
  `@singha/contracts` 25 + `@singha/api` **39** (4 logistics specs) + `@singha/config` 14; `lint`
  **0 errors** (3 pre-existing e2e-script warnings); `format:check` clean. Real-Postgres E2E
  `scripts/e2e-logistics.mjs` (wired into `test:logistics` + acceptance chain + a CI step) seeds
  nodes and proves the Incoterm/node reads, the exact deterministic estimate (SEA_FCL LK→AU ×10 =
  12,500; AIR CIF ×2 = 17,500), freight responsibility from the Incoterm, the quote-not-a-booking
  expiry, and that anonymous quote requests are denied.
- **Money integrity (D5/D6):** every estimate is exact integer minor units, pure code, no float, no
  LLM. `quote != booking` — assumptions/provider/expiry persisted (pack §10).
- **Migration safety:** additive-only (three new tables); existing tables untouched.
- **Provider behind an adapter (pack §14):** fake by default; the Google-style swap is one binding.

## Remaining in E7 (E7b)

- **Booking + Shipment + ShipmentEvent**: accept a fresh quote → a `Booking` (snapshots the quote);
  a `Shipment` + append-only `ShipmentEvent` timeline; the buyer/seller/Singha-arranged freight
  responsibility flows through. Endpoints + a real-Postgres E2E (book a quote, reject an expired /
  already-accepted quote, append shipment events).

## Next

Finish **E7b** (booking + shipment lifecycle), then **E8** — Fees / Tax / Rules engine + Payment
orchestration (versioned, reproducible; regulated routes owner-gated O3/O4), which consumes the E6
routing decision and E5 FX snapshot when a transaction binds.
