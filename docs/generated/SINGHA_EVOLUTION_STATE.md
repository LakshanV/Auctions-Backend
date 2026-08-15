# SINGHA EVOLUTION — PROGRAM STATE

Authoritative phase tracker for the Singha Platform Evolution (pack: `docs/singha-evolution/`).
This is the resume point for any session: read this, then `SINGHA_EVOLUTION_DECISIONS.md`,
then `SINGHA_EVOLUTION_CURRENT_TO_TARGET.md`, then continue the lowest-numbered unfinished
phase. Code overrides stale docs.

- **Frontend** `MUA1234/Auctions-New` @ baseline `1172592fb009dafca89000b1265392dea5a88009`
- **Backend** `LakshanV/Auctions-Backend` @ baseline `f1676fbe1258c164708a4c667d39b8e83b0cb61c`
- Mission: evolve the auction-led product into a **geography-neutral, category-neutral,
  multi-operator** platform for physical assets **and commodities** under **Singha**, with
  **Singha Exchange** as an optional marketplace descriptor. Auction becomes **one** sale
  method behind a neutral Listing. **Not a rewrite.**
- **Single-source-of-truth invariant (Addendum A):** local sites are **Satellite Market
  Nodes** (Discovery or Local Commerce mode) but **all** binding commercial records
  (`Listing`/`Offer`/`Auction`/`Sale`/`Payment`/`Shipment`) live in the one central
  authoritative backend — **no** per-country ledgers. Routing resolves operator/terms/
  payment/compliance per transaction.

---

## Phase tracker

| Phase  | Scope                                                                                                                                                    | Status  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **E0** | Audit + baseline + `CURRENT_TO_TARGET` gap analysis + vendored pack + evidence scaffolding                                                               | ✅ PASS |
| **E1** | Brand / product language + geography-neutral frontend IA (Explore/Exchange/Sell/Wanted/Services); language glossary audit                                | ✅ PASS |
| E2     | Config foundations: `Operator`, `Market/Jurisdiction`, `Location` (roles), `UnitDefinition`, `SaleMethodDefinition`                                      | ✅ PASS |
| E3     | Universal Listing evolution (quantity/unit, structured location, sale-method code, operator link) + category schemas                                     | ✅ PASS |
| **E4** | **Commercial Offer Engine V2 — highest functional priority** (Offer + immutable OfferRevision, sealed = MANUAL_SELECTION)                                | ✅ PASS |
| E5     | Currency / FX / display currency (binding vs informational)                                                                                              | ✅ PASS |
| E6     | Transaction Routing engine + two-layer Terms                                                                                                             | ✅ PASS |
| E7     | Logistics / Ports / Incoterms                                                                                                                            | ✅ PASS |
| E8     | Fees / Tax / Rules engine + Payment orchestration (regulated routes)                                                                                     | ✅ PASS |
| E9     | Procurement / Wanted / RFQ / Reverse Tender (two-sided market)                                                                                           | ✅ PASS |
| E10    | Supply Programmes + perishable-goods metadata                                                                                                            | ✅ PASS |
| E11    | Singha ID extensions + unified Dashboard + Admin Control Centre                                                                                          | ✅ PASS |
| E12    | Discovery / AI / Intelligence expansion (matching, offer/pricing/logistics intelligence)                                                                 | pending |
| E13    | **Satellite Market Node** (Discovery + Local Commerce modes, central canonical ledger) + SEO/local-site integration (canonical, hreflang, landing pages) | pending |
| E14    | Hardening / compatibility / legacy-retirement decisions                                                                                                  | pending |
| E15    | Controlled pilot + `SINGHA_EVOLUTION_FINAL_GO_NO_GO.md`                                                                                                  | pending |

Each phase: implement → test → self-review (15-point, pack `13`) → correct → retest →
`SINGHA_EVOLUTION_PHASE_<N>_REPORT.md` with verdict PASS / PASS_WITH_OWNER_ACTIONS / BLOCKED.
Never PASS only because code builds.

---

## Owner / Legal register (blocks specific phases until confirmed)

These are owner-only per pack `16`; Claude ships config as `DRAFT/UNVERIFIED` and returns
`MANUAL_REVIEW_REQUIRED` for binding paths that depend on them. None blocks E0–E5 build work.

| #   | Needed decision / credential                                                    | Blocks                                         |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| O1  | Legal entity names + which operator contracts in each market (SL/AU/IN)         | E6 terms binding, invoices                     |
| O2  | Auction licensing eligibility per market (where auctions are legally permitted) | E-auction eligibility enablement               |
| O3  | Tax/VAT/GST conclusions per jurisdiction/method                                 | E8 tax rule _values_ (engine is buildable now) |
| O4  | Regulated payment/settlement providers + credentials per operator               | E8 real settlement, `OPERATOR_PAYMENTS`        |
| O5  | FX provider + credentials                                                       | E5 live FX (fake/adapter buildable now)        |
| O6  | Logistics provider(s) + credentials; port master data                           | E7 live quotes (structure buildable now)       |
| O7  | KYC/licence requirements per activity/market                                    | E11 verification gating _values_               |
| O8  | Final public rollout approval; DNS/hosting; Hostinger move                      | E15 GO                                         |

Until each is confirmed, the corresponding capability stays flag-off and non-binding.

---

## Change log

- **E0 (PASS)** — pack read in full; vendored to `docs/singha-evolution/` in both repos;
  baseline SHAs recorded; `DECISIONS` + this `STATE` created. Gap analysis
  (`SINGHA_EVOLUTION_CURRENT_TO_TARGET.md`) authored from a real code audit of both repos.
  Addendum A (Satellite Market Node) added from owner directive.
- **E1 (PASS)** — frontend brand/language rebrand (Singha, geography-neutral, multi-method;
  un-gated) + geography-neutral IA (Explore/Exchange/Sell/Wanted/Services) behind default-OFF
  `neutralIaV1` with its own `?evo=on` preview channel + 3 editorial routes; language glossary +
  build-enforced guard test; hydration verified clean. See
  `SINGHA_EVOLUTION_PHASE_E1_REPORT.md` (authored in the frontend repo). Next: **E2**.
- **E2 increment 1 (E2a, PASS)** — additive backend config foundations: 8 config-only tables +
  4 enums (`unit_definition`, `sale_method_definition`, `market`, `operator`, `operator_market`,
  `location`, `market_node`, `market_node_operator`) via an additive-only migration; canonical
  sale-method (17) + unit (19) taxonomies in `@singha/contracts` consumed by the seed; pure
  `@singha/domain` sale-method logic enforcing D3 (legacy enum 1:1) + D4 (offers never auto-bind)
  with 6 tests; runtime flags `multiOperator`/`structuredLocations`/`quantityUnits`/
  `saleMethodConfig` (default OFF). Owner-gated Operator/Node config ships `draft`. All new tables
  are central config (Addendum A — no per-country ledgers). Gates green (build/typecheck/lint/
  format/96 domain tests). See `SINGHA_EVOLUTION_PHASE_E2_REPORT.md`. Remaining E2 (increment 2):
  flag-gated HTTP read surfaces + Operator/Node admin + real-Postgres integration test.
- **E2 increment 2 (E2b, PASS) — E2 COMPLETE** — `platform-config` NestJS module with public,
  flag-gated read endpoints under `/api/v1/platform` (`sale-methods`, `units`, `markets`,
  `operators`, `nodes`; each 404s until its flag is on; operator legal identity never exposed).
  Controller unit test (3) for independent flag gating; real-Postgres integration test asserting
  the 8 tables migrate, the market→operator→node graph persists with relations, and the
  owner-gated/Addendum-A defaults hold (draft / DISCOVERY / capabilities-off) + unique constraints.
  Gates green (build 7/7, typecheck 13/13, domain 96 + api 24 tests, lint 0 errors, format clean).
  See `SINGHA_EVOLUTION_PHASE_E2_REPORT.md`. Next: **E3** (Universal Listing evolution).
- **E2 review (PASS + hardened)** — adversarial review of the E2 diff returned PASS with one low
  finding (D3/D4 example-tested but not structurally enforced). Fixed: a zod `superRefine` on the
  sale-method schema (offer ⟹ not auto-bind; isAuction ⟺ auction) + all-rows integrity tests
  (D4 across every row, D3 1:1 + reverse uniqueness + coverage, negative tests). No future edit
  can silently reintroduce sealed-offer auto-award.
- **E3 (PASS)** — Universal Listing expand step (additive, consumers untouched): new nullable
  `Listing` columns — `sale_method_code` (+ migration backfill from the enum, + dual-write on
  create), Decimal quantity/unit + pricing basis + unit price, six structured-location role FKs,
  and operator/origin-node attribution (Addendum A). Additive migration
  (`20260815100000_...`, 14 ADD COLUMN + backfill + 8 FK, zero DROP/RENAME); contracts
  (`listing-domains`); domain `saleMethodCodeForLegacyEnum`; real-Postgres integration test.
  Gates green (build 7/7, typecheck 13/13, domain 97 + contracts 25 tests, lint 0, format clean).
  See `SINGHA_EVOLUTION_PHASE_E3_REPORT.md`. Next: **E4 — Commercial Offer Engine V2**.
- **E4 increment 1 (E4a, PASS)** — Commercial Offer Engine V2, data model + the money-critical
  engine. Additive schema: immutable `OfferRevision` (full commercial terms: total/unit price,
  currency, Decimal quantity, Incoterm, delivery, payment, freight, validity, conditions) +
  `Offer` extensions (`currentRevisionId`/`saleMethodCode`/`sealed`/`revealedAt`/`awardPolicy`);
  additive migration `20260815110000_...` (5 ADD COLUMN + offer_revision table, zero DROP/RENAME).
  Pure `@singha/domain` `offer-revision` engine (11 tests) encoding **D4** (MANUAL_SELECTION
  default never auto-awards the highest; AUTO_HIGHEST only when configured) + sealed
  confidentiality (counts-only pre-reveal; ranked view gated on reveal + role). Contracts
  `offer-domains`. Owner directive D12 (Google-currency FX source, E5) recorded. Gates green
  (build 7/7, typecheck 13/13, domain 108 + contracts 25 tests, lint 0, format clean).
  Remaining E4 (E4b): offers API + atomic accept→Sale + concurrency/confidentiality integration
  tests. See `SINGHA_EVOLUTION_PHASE_E4_REPORT.md`.
- **E4 increment 2 (E4b, PASS) — E4 COMPLETE** — Commercial Offer Engine V2 HTTP surface + the
  money-critical atomic binding. New runtime flags `commercialOffersV2`/`sealedOffers` (default
  OFF) across `@singha/config` (3 files) + the DB `FeatureFlag` seed. `offers` NestJS module at
  `/api/v1/commercial-offers` (server-authorised: `exchange:participate` buyers submit/withdraw;
  `exchange:operate` seller/operator counter/reject/reveal/accept/award): submit→counter (appends
  an immutable revision)→accept for open negotiation; submit(receipt)→participation(counts)→reveal
  →award for sealed. The binding core (`bindOfferToSale`) row-locks the listing, verifies
  not-already-awarded, snapshots the selected `OfferRevision`, binds the **exact integer** total
  (`bindingTotalMinor`, float-free; a non-exact unit×qty defers to E8), creates **one** `Sale`
  (UNIQUE per listing), rejects the losers, reserves bid-capacity (§11) and emits SALE_CONFIRMED +
  audit — atomically via the existing `UnitOfWork`. Real-Postgres E2E `scripts/e2e-offers.mjs`
  (wired into `test:offers` + acceptance chain + its own CI step) proves append-only revisions,
  atomic accept (concurrent burst → exactly one Sale), sealed no-leak pre-reveal, and **D4**
  (MANUAL_SELECTION never auto-awards the highest; the operator may bind the lowest; AUTO_HIGHEST
  only when explicitly configured). New domain tests for the binding total (114 domain tests) +
  an offers flag/authorisation unit spec (27 api tests). Gates green (build 7/7, typecheck 13/13,
  lint 0 errors, format clean). No new migration (E4a's is additive; E4b is flags + code). See
  `SINGHA_EVOLUTION_PHASE_E4_REPORT.md`. Next: **E5** (currency / FX / display currency —
  Google-currency adapter, D12).
- **E5 (PASS)** — Currency / FX / display currency. Contracts `fx-domains` (SUPPORTED_CURRENCIES +
  minor-unit exponents; `fxRateSnapshot`; convert request/response). Pure `@singha/domain`
  `platform/fx` engine (11 tests): float-free `parseRateToScaled` + `convertMinor`
  (`amount × rate × 10^quoteExp / 10^baseExp`, exact bigint, half-up rounding, JPY zero-decimal,
  `marginBps` spread) + `isRateFresh`/`buildRateSnapshot`. Swappable FX provider adapter
  (`FxRateProvider`/`FX_PROVIDER`): a deterministic **credential-free fake** bound by default and a
  `GoogleFxProvider` selected only when `FX_API_URL` is set (D12; owner O5). Flag-gated `fx` module
  at `/api/v1/fx` (`currencies`/`rate`/`convert`): every conversion is **informational**
  (`binding: false`) — display never mutates the binding transaction currency (D5). Additive
  `FxRateSnapshot` table (migration `20260815120000_...`, single CREATE TABLE + index, zero
  DROP/RENAME) persists + caches snapshots. New flags `multiCurrency`/`fxDisplay` (default OFF) +
  server-only `FX_API_URL`/`FX_API_KEY` (key never in the client view). Real-Postgres E2E
  `scripts/e2e-fx.mjs` (wired into `test:fx` + acceptance chain + a CI step) proves exact
  conversion ($100 → 30,000 LKR; round-trip), `binding:false`, same-currency identity, validation,
  and snapshot persistence + cache reuse. Gates green (build 7/7, typecheck 13/13, domain 125 +
  api 32 + contracts 25 + config 14 tests, lint 0 errors, format clean). No binding path uses a
  live rate yet. See `SINGHA_EVOLUTION_PHASE_E5_REPORT.md`. Next: **E6** (Transaction Routing +
  two-layer Terms).
- **E6 (PASS)** — Transaction Routing engine + two-layer Terms. Contracts `routing-domains`
  (routing input/resolution, terms resolution). Pure `@singha/domain` `modules/routing` (11 tests):
  `resolveRouting` — table-driven, specificity-scored, deterministic total ordering
  (specificity→priority→code→version), explainable `trace`, **no country if/else forest**; an
  unverified matched rule is a non-binding preview and a verified rule holds for unmet KYC/licence
  (D7); no match → MANUAL_REVIEW_REQUIRED. `resolveTerms` — platform (highest version) + most-
  specific transaction terms; RESOLVED only when both owner-`verified`. Three additive tables
  (`routing_rule`, `terms_document`, `routing_decision`) via migration `20260815130000_...`
  (3 CREATE TABLE + indexes, zero DROP/RENAME); decisions persist as an explainable audit snapshot
  (Addendum A). Flag-gated `routing` module at `/api/v1/routing` (`resolve`/`terms`,
  `exchange:operate`) — preview + audit only, no binding. New flag `transactionRouting` (default
  OFF) across `@singha/config` (3 files) + seed. Real-Postgres E2E `scripts/e2e-routing.mjs`
  (wired into `test:routing` + acceptance chain + a CI step) proves no-match/verified/most-specific/
  draft-preview/KYC-hold resolution, two-layer terms, and server-side authorisation. Gates green
  (build 7/7, typecheck 13/13, domain 136 + api 35 + contracts 25 + config 14 tests, lint 0 errors,
  format clean). Binding routes await owner O1 (verified operator/terms). See
  `SINGHA_EVOLUTION_PHASE_E6_REPORT.md`. Next: **E7** (Logistics / Ports / Incoterms).
- **E7 increment 1 (E7a, PASS)** — Logistics config + Incoterms + the deterministic quote engine.
  Contracts `logistics-domains` (INCOTERMS EXW/FCA/FOB/CFR/CIF/DAP, node kinds, transport modes,
  freight arrangers, quote schemas). Pure `@singha/domain` `modules/logistics` (7 tests):
  `resolveFreightArranger` (Incoterm-driven), `estimateFreightMinor` (base × units × zone in exact
  integer minor-unit bigint, half-up, float-free — D5/D6), `isQuoteFresh`/`canBookQuote`
  (quote ≠ booking). Swappable `LogisticsProvider` adapter + credential-free `FakeLogisticsProvider`
  (live quotes await O6). Three additive tables (`logistics_node`, `logistics_provider`,
  `logistics_quote`) via migration `20260815140000_...` (3 CREATE TABLE + indexes, zero
  DROP/RENAME). Flag-gated `logistics` module at `/api/v1/logistics` (incoterms/nodes reads +
  quote request/read); a quote persists assumptions/provider/expiry. New flags
  `logistics`/`logisticsQuotes` (default OFF) across `@singha/config` (3 files) + seed.
  Real-Postgres E2E `scripts/e2e-logistics.mjs` (wired into `test:logistics` + acceptance chain +
  a CI step) proves the reads, the exact estimate (SEA_FCL LK→AU ×10 = 12,500; AIR CIF ×2 =
  17,500), Incoterm-driven freight responsibility, quote-not-a-booking expiry, and anonymous
  denial. Gates green (build 7/7, typecheck 13/13, domain 143 + api 39 + contracts 25 + config 14
  tests, lint 0 errors, format clean). Remaining E7 (E7b): Booking + Shipment + ShipmentEvent
  lifecycle. See `SINGHA_EVOLUTION_PHASE_E7_REPORT.md`.
- **E7 increment 2 (E7b, PASS) — E7 COMPLETE** — accepted-quote → Booking → Shipment lifecycle.
  Pure `@singha/domain` `shipment` state machine (3 tests: forward-only, cancel-from-live, reject
  skips/reversals/terminal). Three additive tables (`logistics_booking`, `logistics_shipment`,
  `logistics_shipment_event`) via migration `20260815150000_...` (3 CREATE TABLE + FKs, zero
  DROP/RENAME on existing tables). `POST /api/v1/logistics/quotes/:id/book` is atomic under a quote
  row lock — books at most once (UNIQUE booking per quote), refuses expired/already-accepted quotes,
  and snapshots the quote's terms onto the booking; it creates the booking + an initial BOOKED
  shipment + first timeline event. `GET /shipments/:id` (append-only timeline) +
  `POST /shipments/:id/events` (`exchange:operate`, lifecycle-validated). Extended E2E
  `scripts/e2e-logistics.mjs` proves book→booking+shipment, re-book 409, operator advance
  BOOKED→PICKED_UP→IN_TRANSIT, illegal-skip 409, buyer-advance 403, expired-quote-book 409. Gates
  green (build 7/7, typecheck 13/13, domain 146 + api 39 + contracts 25 + config 14 tests, lint 0
  errors, format clean). See `SINGHA_EVOLUTION_PHASE_E7_REPORT.md`. Next: **E8** — Fees / Tax /
  Rules engine and Payment orchestration.
- **E8 increment 1 (E8a, PASS)** — Fees / Tax rules engine. Contracts `fees-domains` (charge
  components/sides/bases/appliesTo, compute request/result). Pure `@singha/domain` `modules/fees`
  (7 tests): `computeCharges` — versioned, deterministic, **float-free** (exact integer minor units,
  half-up); **exactly one rule per component** (most-specific → priority → code → version, no
  double-charge); buyer fees on principal, tax on principal-or-buyer-subtotal, seller commission
  deducted from proceeds; value-band rules; every line snapshots the applied rule code+version+rate
  (**reproducible after rules change**); an unverified applied rule → non-binding
  `MANUAL_REVIEW_REQUIRED` preview (O3/D7). Two additive tables (`fee_rule`, `fee_breakdown`) via
  migration `20260815160000_...` (2 CREATE TABLE + indexes, zero DROP/RENAME). Flag-gated `fees`
  module at `/api/v1/fees/compute` (`exchange:operate`) computes + persists a breakdown snapshot.
  New flag `feesEngine` (default OFF) across `@singha/config` (3 files) + seed. Real-Postgres E2E
  `scripts/e2e-fees.mjs` (wired into `test:fees` + acceptance chain + a CI step) proves the full
  breakdown (buyer 132,250 / seller proceeds 92,000), per-line reproducibility, unverified-tax
  preview, most-specific-wins, no-match zeros, and server-side authorisation. Gates green (build
  7/7, typecheck 13/13, domain 153 + api 42 + contracts 25 + config 14 tests, lint 0 errors, format
  clean). Remaining E8 (E8b): payment orchestration (regulated routes, owner O4). See
  `SINGHA_EVOLUTION_PHASE_E8_REPORT.md`.
- **E8 increment 2 (E8b, PASS) — E8 COMPLETE** — Payment orchestration. Contracts
  `payments-domains` (route resolution, provider kinds, webhook). Pure `@singha/domain`
  `modules/payments` (5 tests): `resolvePaymentRoute` — deterministic, operator-scoped,
  most-specific-wins resolution to an **external regulated** provider (no internal ledger/escrow
  kind exists); unverified route → non-binding preview (O4); no route → MANUAL_REVIEW_REQUIRED;
  bank-transfer/offline → requiresManualSettlement. Three additive tables (`payment_route`,
  `payment_intent`, `payment_webhook_event`) via migration `20260815170000_...` (3 CREATE TABLE +
  indexes, zero DROP/RENAME). Flag-gated `payments` module: `POST /api/v1/payments/resolve-route`
  (`exchange:operate`) resolves + persists an intent; `POST /api/v1/payments/webhook` is
  HMAC-SHA256 signature-verified (constant-time) + idempotent (UNIQUE provider+eventId). New flag
  `operatorPayments` (default OFF) + server-only `PAYMENT_WEBHOOK_SECRET`. Real-Postgres E2E
  `scripts/e2e-payments.mjs` (wired into `test:payments` + acceptance chain + a CI step) proves
  verified-route resolution, no-route/unverified MANUAL_REVIEW, bank-transfer manual settlement,
  signed+idempotent webhooks (bad sig 401, replay no-op), and server-side authorisation. Gates
  green (build 7/7, typecheck 13/13, domain 158 + api 46 + contracts 25 + config 14 tests, lint 0
  errors, format clean). See `SINGHA_EVOLUTION_PHASE_E8_REPORT.md`. Next: **E9** (Procurement / RFQ
  / Reverse Tender).
- **E9 (PASS)** — Procurement / Wanted / RFQ / Reverse Tender (the buyer-initiated two-sided market).
  Contracts `procurement-domains` (`RFQ`/`REQUEST_SUPPLY`/`REVERSE_TENDER`, statuses; create request,
  submit proposal reusing the E4 `offerProposalSchema`, award requiring an explicit
  `selectedProposalId`). Pure `@singha/domain` `modules/procurement` (7 tests): `PROCUREMENT_TRANSITIONS`
  - `assertProcurementTransition` (open→closed→awarded, closed can reopen, terminal awarded/cancelled);
    `procurementParticipation` + `rankProcurementProposals` (cheapest-first **recommendation only**, exact
    bigint compare, reusing E4 `comparableHeadlineMinor`); and `selectProcurementWinner`, which
    **structurally requires** a closed window **and** an explicit buyer selection — the cheapest is never
    auto-awarded (§09 / D4). Two additive tables (`procurement_request`, `procurement_proposal`) via
    migration `20260815180000_...` (2 CREATE TABLE + indexes, zero DROP/RENAME; money `BigInt`, quantity
    `Decimal(38,9)`). Flag-gated `procurement` module at `/api/v1/procurement` (`exchange:participate`):
    buyer posts/closes/awards (ownership-enforced, non-owner 403), suppliers submit while open, owner-only
    ranked proposal view; award marks winner `accepted` + losers `rejected` atomically via `UnitOfWork` +
    audit. New flag `procurement` (default OFF) across `@singha/config` (3 files) + seed. Real-Postgres
    E2E `scripts/e2e-procurement.mjs` (wired into `test:procurement` + acceptance chain + a CI step) proves
    RFQ post, three proposals, award-before-close 409, non-owner close/view 403, cheapest-first ranking
    (B,C,A), and the buyer awarding the **dearest (A) explicitly** — DB confirms request awarded→A, A
    accepted, cheapest loser rejected. Gates green (build 7/7, typecheck 13/13, domain 165 + api 47 +
    contracts 25 + config 14 tests, lint 0 errors, format clean). See
    `SINGHA_EVOLUTION_PHASE_E9_REPORT.md`. Next: **E10** (Supply Programmes + perishable-goods metadata).
- **E10 (PASS)** — Supply Programmes + perishable goods (the recurring-availability side + the
  agricultural/food specialist metadata). Contracts `supply-domains` (frequencies, programme
  statuses, pricing bases; create programme, set status, buyer-side `recommendSupply` criteria;
  `perishableMetadata` + `attachPerishable` for a listing or programme subject — decimal strings,
  never floats). Pure `@singha/domain` `modules/supply` (10 tests): `assertSupplyProgrammeTransition`
  (draft→active→paused, expired/withdrawn terminal); float-free `scaleDecimal` + `assertOrderQuantities`
  (min ≤ max); `isSupplyProgrammeOfferable` (active + in validity window); `recommendProgrammes` —
  cheapest-first matching that is a **recommendation only**, creating/binding nothing (§09 / D4); and
  the perishable engine `assertPerishableConsistent` (date/temperature/moisture ordering → 422),
  `perishableExpiresAt` + `isPerishableExpired` (the **automatic-expiry** predicate: earliest of
  best-use date and shipment-window end). Two additive tables (`supply_programme`,
  `perishable_metadata` keyed by `(subject_type, subject_id)` so it never mutates the Listing table)
  via migration `20260815190000_...` (2 CREATE TABLE + indexes + unique, zero DROP/RENAME; money
  BigInt, quantities Decimal(38,9), temps Decimal(6,2), moisture Decimal(6,3)). Flag-gated `supply`
  module at `/api/v1/supply` (`exchange:participate`): supplier posts/manages programmes (owner-gated,
  min>max 422, transition 409), buyer `recommend` returns `{ binding:false, recommendations }`
  cheapest-first, perishable upsert (owner/operator-gated) + read with live `expired`/`expiresAt`.
  New flags `supplyProgrammes` + `perishableGoods` (default OFF) across `@singha/config` (3 files) +
  seed. Real-Postgres E2E `scripts/e2e-supply.mjs` (wired into `test:supply` + acceptance chain + a CI
  step) proves the lifecycle guards, advisory matching (excludes draft/over-minimum), automatic
  perishable expiry (future → not expired, past → expired), the 422/403/404 paths, and DB state. Gates
  green (build 7/7, typecheck 13/13, domain 175 + api 49 + contracts 25 + config 14 tests, lint 0
  errors, format clean). See `SINGHA_EVOLUTION_PHASE_E10_REPORT.md`. Next: **E11** (Singha ID + unified
  Dashboard + Admin Control Centre).
- **E11 increment 1 (E11a, PASS)** — Singha ID: one geography-neutral member profile with
  **capability-based verification**. Contracts `singha-id-domains` (capabilities, statuses; update
  profile, request/decide capability). Pure `@singha/domain` `modules/singha-id` (6 tests):
  `activityRequiresCapability` (browse-class open, gated activities map to a capability),
  `effectiveCapabilityStatus` (a verified grant past its expiry reads expired), `evaluateCapability`
  (open yields permitted; a gated activity needs a verified, unexpired grant, else
  VERIFICATION_REQUIRED/PENDING/EXPIRED/REJECTED), `assertCapabilityDecidable` (only pending can be
  decided). Two additive tables (`customer_profile` 1:1 and `customer_capability`) via migration
  `20260815200000_...` (two CREATE TABLE with indexes and a unique index, zero DROP/RENAME — the
  customer table is never mutated). Flag-gated `singha-id` module at `/api/v1/singha-id` (profile
  get/update and capability request/list/evaluate for the member; operator-only `capabilities/decide`
  needs `exchange:operate`). New flag `singhaId` (default OFF) across `@singha/config` (3 files) and
  seed. Real-Postgres E2E `scripts/e2e-singha-id.mjs` (wired into `test:singha-id`, the acceptance
  chain and a CI step) proves the profile round-trip, open browse, gated place_bid
  (VERIFICATION_REQUIRED then pending then operator-verified then permitted), member decide 403,
  non-pending decide 409, expired grant no longer permits, unknown decide 404. Gates green (build 7/7,
  typecheck 13/13, domain 181, api 50, contracts 25, config 14 tests, lint 0 errors, format clean).
  The verification _evidence bar_ per activity/market is owner-gated (O7).
- **E11 increment 2 (E11b, PASS) — E11 COMPLETE** — unified Dashboard and operator Control Centre,
  two read-only cross-domain projections. Pure `@singha/domain` `modules/dashboard` (5 tests):
  `countByStatus` (stable-sorted grouping), `buildDashboard` (Buying/Selling/Verification sections
  with per-status totals), `controlCentreAlerts` (pending verifications and missing operators/markets).
  No new tables — the projections own no authoritative data. Flag-gated `dashboard` module:
  `GET /api/v1/dashboard` (`exchange:participate`) aggregates the caller's watch, offers, procurement
  requests, supply programmes and capabilities; `GET /api/v1/control-centre/overview`
  (`exchange:operate`) returns config and record counts with attention alerts, **operator-scoped** by
  an optional `operatorCode` (operator-scoped records filter by it; global config is unscoped). New
  flags `dashboard` and `controlCentre` (default OFF) across `@singha/config` (3 files) and seed.
  Real-Postgres E2E `scripts/e2e-dashboard.mjs` (wired into `test:dashboard`, the acceptance chain and
  a CI step) proves the cross-domain aggregation, the operate-gated Control Centre (member 403),
  pending-verification alerts, and operatorCode scoping. Gates green (build 7/7, typecheck 13/13,
  domain 186, api 52, contracts 25, config 14 tests, lint 0 errors, format clean). See
  `SINGHA_EVOLUTION_PHASE_E11_REPORT.md`. Next: **E12** (Discovery / AI / Intelligence expansion).
