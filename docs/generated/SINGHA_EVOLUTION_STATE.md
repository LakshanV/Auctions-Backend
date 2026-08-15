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
| E3     | Universal Listing evolution (quantity/unit, structured location, sale-method code, operator link) + category schemas                                     | pending |
| **E4** | **Commercial Offer Engine V2 — highest functional priority** (Offer + immutable OfferRevision, sealed = MANUAL_SELECTION)                                | pending |
| E5     | Currency / FX / display currency (binding vs informational)                                                                                              | pending |
| E6     | Transaction Routing engine + two-layer Terms                                                                                                             | pending |
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
