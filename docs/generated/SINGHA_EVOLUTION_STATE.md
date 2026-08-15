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
| E7     | Logistics / Ports / Incoterms                                                                                                                            | pending |
| E8     | Fees / Tax / Rules engine + Payment orchestration (regulated routes)                                                                                     | pending |
| E9     | Procurement / Wanted / RFQ / Reverse Tender (two-sided market)                                                                                           | pending |
| E10    | Supply Programmes + perishable-goods metadata                                                                                                            | pending |
| E11    | Singha ID extensions + unified Dashboard + Admin Control Centre                                                                                          | pending |
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
