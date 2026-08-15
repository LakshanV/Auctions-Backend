# SINGHA EVOLUTION — PHASE E12 REPORT (Intelligence expansion)

**Verdict: E12 PASS** — additive, behind the default-OFF `insightEngine` flag. Baseline BE `2ee5372`
to this phase. E12 expands Singha Intelligence with **deterministic** matching, offer/pricing
comparison and fraud/risk scoring. The non-negotiable it honours (pack doc 12): deterministic code —
not an LLM — owns money, quantity, eligibility, confidentiality and transaction state; every output
here is a **derived, non-binding recommendation** that never overwrites a fact and never binds a
transaction (rules 3 and 11). No LLM is invoked anywhere in this phase.

## Delivered

**Contracts** (`insight-domains.ts`) — `insightKinds` (`MATCH`, `OFFER_COMPARISON`,
`PRICE_COMPARABLES`, `RISK`); `matchCriteriaSchema`, `compareProposalsSchema`,
`priceComparablesSchema`, `riskSignalsSchema`.

**Pure domain engine** (`@singha/domain` `modules/insight`, 6 tests) — four deterministic engines:

- **Matching** — `scoreMatch` returns null on a hard-filter miss (a specified category / origin /
  unit / quantity constraint the candidate fails) and otherwise an explainable weighted score;
  `rankMatches` orders best-fit first, then cheapest, then id. Advisory: it recommends candidates for
  a human to act on and awards nothing.
- **Offer Intelligence** — `compareProposals` normalizes each proposal to a comparable headline (via
  the E4 `comparableHeadlineMinor`) and ranks cheapest-first, flagging the cheapest and fastest. It
  is explicitly `binding: false` and never selects a winner (D4).
- **Pricing Intelligence** — `priceComparables` computes exact integer count/min/median/max/spread
  over observed prices (integer-division median for even counts — float-free, D5/D6).
- **Fraud/Risk** — `assessRisk` scores review signals into a low/medium/high band with the flags that
  fired. It is a **signal, never an automatic block** — enforcement stays an operator decision.

**Schema** — one additive table `intelligence_report` (append-only derived snapshot of each
computation); migration `20260815210000_evolution_e12_intelligence` is a single `CREATE TABLE` with
an index, **zero** DROP/RENAME/ALTER on existing tables.

**API** (`modules/insight`, flag-gated `insightEngine`) — `POST /api/v1/insight/match`,
`/insight/offers/compare` and `/insight/pricing/comparables` (`exchange:participate`) and
`/insight/risk` (`exchange:operate`, fraud review is operator-only). Each response carries
`binding: false` and is persisted as an `IntelligenceReport`. Matching and pricing read the offerable
supply programmes (E10) as their data source; offer comparison takes complete proposals inline.

**Runtime flag** `insightEngine` (default **OFF**) across `@singha/config` (3 files) and the DB
`FeatureFlag` seed.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **192** tests (6 insight),
  `@singha/contracts` 25, `@singha/api` **53** (1 insight spec), `@singha/config` 14; `lint` **0
  errors** (pre-existing e2e-script warnings only); `format:check` clean. Real-Postgres E2E
  `scripts/e2e-insight.mjs` (wired into `test:insight`, the acceptance chain and a CI step) proves
  advisory matching (best-fit/cheapest first, off-category excluded, explainable factors), exact
  pricing comparables (min 30000 / median 60000 / max 90000), offer comparison (cheapest-first,
  cheapest/fastest flagged, no selection), operator-only risk banding (a buyer is denied 403),
  anonymous denial, and that every persisted report is `binding: false`.
- **Deterministic, no LLM (doc 12):** all scoring/comparison/risk logic is pure integer/`bigint` code;
  money and eligibility are never decided by a model, and nothing here binds a transaction.
- **Derived records never overwrite facts (rule 3):** intelligence is persisted append-only in its own
  table; it references but never mutates the source records.
- **Server-side authorisation (rule 9):** matching/pricing/comparison require `exchange:participate`;
  fraud/risk requires `exchange:operate`; the whole surface 404s while the flag is OFF (unit spec).
- **Migration safety:** additive-only (one new table); existing tables untouched.

## Owner actions (non-blocking)

- None. The engines are deterministic and ship now; richer signals (e.g. real fraud history feeds)
  can be wired later without changing the non-binding contract.

## Next

**E13** — Satellite Market Node (Discovery and Local Commerce modes, central canonical ledger) with
SEO / local-site integration.
