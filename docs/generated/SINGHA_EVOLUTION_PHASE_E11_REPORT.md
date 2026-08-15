# SINGHA EVOLUTION — PHASE E11 REPORT (Singha ID + unified Dashboard + Control Centre)

**Verdict: E11 PASS** — additive, behind the default-OFF `singhaId` / `dashboard` / `controlCentre`
flags. Baseline BE `4f0c60f` → this phase, shipped in two increments: **E11a** = Singha ID (one
geography-neutral member profile + capability-based verification); **E11b** = the unified Dashboard and operator Control Centre (read-only cross-domain projections). The verification _evidence bar_ per
activity/market is owner-gated (register **O7**); the engine and gating ship now.

## E11a delivered (Singha ID)

**Contracts** (`singha-id-domains.ts`) — `singhaCapabilities` (`place_bid`, `make_offer`, `sell`,
`operate_auction`, `export`, `import`, `high_value_trade`), `capabilityStatuses`;
`updateSinghaProfileSchema`, `requestCapabilitySchema`, `decideCapabilitySchema`.

**Pure domain engine** (`@singha/domain` `modules/singha-id`, 6 tests) — capability-based
verification: `activityRequiresCapability` (browse/search/watch are open; a gated activity maps to
its capability), `effectiveCapabilityStatus` (a verified grant past its expiry reads expired),
`evaluateCapability` (open → permitted; gated → needs a verified, unexpired grant, else
`VERIFICATION_REQUIRED` / `_PENDING` / `_EXPIRED` / `_REJECTED`), `assertCapabilityDecidable` (only a
pending grant can be decided → `IllegalTransition`/409).

**Schema** — two additive tables (`customer_profile` 1:1, `customer_capability`); migration
`20260815200000_evolution_e11a_singha_id` is `CREATE TABLE` × 2 + indexes + a unique index, **zero**
DROP/RENAME/ALTER — the `customer` table is never mutated (profile/capability reference it by id).

**API** (`modules/singha-id`, flag-gated `singhaId`) — a member reads/updates one profile and
requests/lists/evaluates capabilities (`exchange:participate`); an operator decides a pending
capability (`exchange:operate`) — the operator need not be a customer (authority is the permission).

## E11b delivered (Dashboard + Control Centre)

**Pure domain engine** (`@singha/domain` `modules/dashboard`, 5 tests) — `countByStatus`
(stable-sorted status grouping), `buildDashboard` (assembles Buying / Selling / Verification sections
with per-status totals from fetched rows), `controlCentreAlerts` (surfaces pending verifications +
missing operators/markets). These are **derived projections** — they own no authoritative data.

**API** (`modules/dashboard`, flag-gated) — `GET /api/v1/dashboard` aggregates the caller's watching
(watch), offers, procurement requests (buyer), supply programmes (supplier), procurement responses
(supplier) and capabilities (effective status) into one command centre. `GET
/api/v1/control-centre/overview` (`exchange:operate`) returns config + record counts + attention
alerts, **operator-scoped** by an optional `operatorCode` (operator-scoped records —
routing/fee/payment rules, supply programmes, procurement requests — filter by it; global config is
unscoped). No new tables; both are read-only.

**Runtime flags** `singhaId` / `dashboard` / `controlCentre` (default **OFF**) across
`@singha/config` (3 files) + the DB `FeatureFlag` seed.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **186** tests (6 singha-id + 5
  dashboard) + `@singha/contracts` 25 + `@singha/api` **52** (1 singha-id + 2 dashboard specs) +
  `@singha/config` 14; `lint` **0 errors** (pre-existing e2e-script warnings only); `format:check`
  clean. Real-Postgres E2E `scripts/e2e-singha-id.mjs` proves the profile round-trip, open browse,
  gated place_bid (`VERIFICATION_REQUIRED` → pending → operator-verified → permitted), member decide
  403, non-pending decide 409, expired grant stops permitting, unknown decide 404;
  `scripts/e2e-dashboard.mjs` proves the cross-domain dashboard aggregation, the operate-gated
  Control Centre (member 403), pending-verification alerts, and operatorCode scoping. Both are wired
  into their `test:*` scripts + the acceptance chain + CI steps.
- **Capability-based verification (pack §Singha ID):** browse broadly; a gated activity requires a
  verified, unexpired capability an operator granted. Deciding is operator-only and structurally
  one-way (only pending → verified/rejected).
- **Server-side authorisation (rule 9):** profile/capability writes are the member's own; deciding
  requires `exchange:operate`; the Control Centre requires `exchange:operate`; each surface 404s
  while its flag is OFF (unit specs).
- **Projection safety:** the Dashboard/Control Centre own no data — every figure is derived from the
  domain that owns the record; protected records are operator-scoped by `operatorCode`.
- **Migration safety:** additive-only (two new tables in E11a; E11b adds none); the customer table is
  untouched.

## Owner actions (non-blocking)

- **O7 — KYC/licence requirements per activity/market.** The capability engine + gating ship now with
  a safe placeholder activity→capability map; the specific evidence bar an operator must see before
  verifying each capability is owner-supplied. Until then verification is operator-judgement behind
  the same server-side gate.

## Next

**E12** — Discovery / AI / Intelligence expansion (matching, offer/pricing/logistics intelligence).
