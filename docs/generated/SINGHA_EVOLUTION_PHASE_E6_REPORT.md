# SINGHA EVOLUTION — PHASE E6 REPORT (Transaction Routing + two-layer Terms)

**Verdict: E6 PASS** — additive, behind the default-OFF `transactionRouting` flag. Baseline BE
`58cf139` → this phase. The routing engine + terms resolution are complete and deterministic; any
route that depends on unverified operator/terms config resolves as a non-binding
`MANUAL_REVIEW_REQUIRED` preview until the owner verifies it (DECISIONS D7, owner register O1).

## Delivered

**Contracts** (`@singha/contracts` `routing-domains.ts`) — routing input/resolution + terms:

- `routingInputSchema` — the transaction shape (saleMethod + optional market / jurisdiction /
  operator / origin node / destination / currency / KYC + licence status). `originNodeCode` carries
  the Satellite Market Node attribution (Addendum A); binding state stays central.
- `routingResolutionSchema` — status (`RESOLVED` | `MANUAL_REVIEW_REQUIRED`), transaction operator,
  payment route, terms, disclosures, required verification, the matched rule + version, a reason and
  an explainable `trace`.
- `termsResolutionSchema` — the two-layer platform + transaction terms refs.

**Pure domain engine** (`@singha/domain` `modules/routing`, 11 tests):

- `resolveRouting` — table-driven, specificity-scored match over `RoutingRule` rows (NO country
  `if/else` forest). Deterministic total ordering (specificity → priority → code → version), so the
  same input + rule set always resolves identically and explainably. An **unverified** matched rule
  is a non-binding preview (D7); a verified rule still **holds** for any KYC/licence the party has
  not satisfied. No match → `MANUAL_REVIEW_REQUIRED`.
- `resolveTerms` — platform terms (highest active version) + the most-specific active transaction
  terms; `RESOLVED` only when both are present and owner-`verified`, else `MANUAL_REVIEW_REQUIRED`.
  Legal wording stays owner-reviewed content behind `bodyRef` — Claude never invents law (D7).

**Schema** — three additive tables (`routing_rule`, `terms_document`, `routing_decision`);
migration `20260815130000_evolution_e6_routing_terms` is `CREATE TABLE` × 3 + indexes, **zero**
DROP/RENAME/ALTER. `routing_decision` is the append-only, explainable audit snapshot of each
resolution (Addendum A — routing input + persistence).

**API** (`apps/api` `modules/routing`, flag-gated `transactionRouting`, `exchange:operate`) —
`POST /api/v1/routing/resolve` (resolves + persists a decision) and `POST /api/v1/routing/terms`.
Preview + audit only; no binding occurs here (binding money paths consume this in E8).

**Runtime flag** `transactionRouting` (default **OFF**) across `@singha/config` (3 files) + the DB
`FeatureFlag` seed.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **136** tests (11 routing/terms)
  - `@singha/contracts` 25 + `@singha/api` **35** (3 routing specs) + `@singha/config` 14; `lint`
    **0 errors** (3 pre-existing e2e-script warnings); `format:check` clean. Real-Postgres E2E
    `scripts/e2e-routing.mjs` (wired into `test:routing` + acceptance chain + a CI step) seeds rule /
    terms config and proves: no-match → MANUAL_REVIEW; verified rule → RESOLVED + persisted decision;
    most-specific rule wins; draft rule → preview (D7); KYC-required holds then resolves; two-layer
    terms resolve; unverified terms → MANUAL_REVIEW; a buyer cannot resolve (403).
- **Deterministic + explainable + versioned (pack 07):** total ordering + a per-decision `trace`;
  every rule and terms doc is versioned; decisions persist with the matched rule version.
- **D7 upheld:** unverified operator/terms config never binds automatically — it is surfaced as a
  preview with `MANUAL_REVIEW_REQUIRED`; no legal wording is invented.
- **Migration safety:** additive-only (three new tables); existing tables untouched.
- **Addendum A:** routing takes `originNodeCode`/`operatorCode` as input and persists the decision;
  all state stays in the one central backend.

## Owner action (non-blocking)

- **O1 — legal entity names + which operator contracts apply per market.** Until routing rules and
  terms documents are marked `verified`, binding routes return `MANUAL_REVIEW_REQUIRED`. The engine,
  config tables and preview are fully functional now; verification is a data/owner step, not code.

## Next

**E7** — Logistics / Ports / Incoterms: ports/airports/depots, transport methods, routes, quotes,
bookings and shipments behind the logistics provider adapter (structure buildable now; live quotes
await owner register O6).
