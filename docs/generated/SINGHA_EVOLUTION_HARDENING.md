# SINGHA EVOLUTION — HARDENING, COMPATIBILITY & LEGACY-RETIREMENT (E14)

Companion to `SINGHA_EVOLUTION_STATE.md`. Records the E14 hardening posture, the automated
compatibility guards, and the legacy-retirement decisions. Nothing here changes runtime behaviour;
it consolidates and permanently enforces the invariants E2–E13 relied on.

## 1. Compatibility guards (automated, in CI)

Two pure guards now fail the build if a future edit breaks a core invariant:

- **Additive-only migrations** (`database/src/evolution-migrations.guard.test.ts`) — scans every
  `*evolution*` migration and fails on `DROP TABLE/COLUMN/CONSTRAINT/INDEX`, `DROP NOT NULL`,
  `RENAME`, `TRUNCATE` or `ALTER COLUMN`. This is the structural enforcement of pack **rule 10** (no
  destructive production migration) and of the "existing tables untouched" claim in every E2–E13
  report. All shipped evolution migrations are `CREATE TABLE` / `CREATE INDEX` / `ADD COLUMN` /
  `ADD CONSTRAINT` (plus data-only backfills), and the guard proves it.
- **Flags default OFF** (`packages/config/src/evolution-flags.guard.test.ts`) — asserts all 21
  evolution capability flags default OFF, so no evolution surface can go live without an explicit
  env/config opt-in (pack doc 13/18: ship dark, roll out internal → cohort → general).

## 2. Rollback posture (pack doc 14)

Every evolution capability is **feature-flagged and additive**, so the rollback path is:

1. **Disable the flag** (env/config) — the surface 404s immediately; no schema change, no data loss.
2. **Forward-fix** if needed — additive migrations are never down-migrated away from live data.

Because binding records are exact, append-only and central (see §3), disabling a flag never orphans
or corrupts committed state.

## 3. Legacy-retirement register

| Legacy (V1 / pre-evolution) assumption           | Superseded by                                                       | Status                          |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------- |
| Auction is the primary/root sale method          | Neutral `Listing` + configurable `SaleMethod` (auction is one code) | Superseded (E2/E3), enum kept   |
| Local sites are referral/marketing only          | Satellite Market Node (Discovery **and** Local Commerce modes)      | Superseded (E13, Addendum A)    |
| Single implicit operator / single market         | `Operator` / `Market` / `MarketNode` config + routing               | Superseded (E2/E6)              |
| Single transaction currency, no display currency | Multi-currency + informational display conversion (never binding)   | Superseded (E5), binding intact |
| Money/price as decimals in app logic             | Exact integer minor units (bigint); Decimal(38,9) quantities        | Enforced (D5/D6) everywhere new |
| Flat location string                             | Structured location roles (asset/seller/pickup/origin/destination)  | Superseded (E3), flat kept      |
| Referral-only "hand-off" for local transactions  | Central canonical ledger + node origination attribution             | Superseded (E13)                |
| Ad-hoc fees/tax in code                          | Versioned, deterministic, reproducible fee/tax rules engine (E8)    | Superseded (E8)                 |

**Preserved (not retired):** the authoritative bid ledger, row-locking, proxy/reserve privacy,
soft-close, winner determination, idempotency, the legacy `SaleMethod` enum (1:1 with sale-method
codes, D3), the flat-location and single-currency columns (still written), and all V1 permanent
customer/asset/bid/auction/payment/settlement/audit data. No column or table was dropped or renamed.

## 4. Security & confidentiality posture (pack doc 12, shipped across phases)

- **AuthZ:** server-side RBAC on every mutating route; operator-scoping on protected records;
  capability-based verification (E11) gates risk-bearing activities.
- **Confidentiality:** sealed offers reveal counts-only pre-reveal (E4); cross-operator/node
  protected-record access denied; aggregate counts never de-anonymise (E11b Control Centre counts).
- **Payments:** external regulated providers only (no internal ledger/escrow); HMAC-signed,
  idempotent webhooks (E8b).
- **Intelligence:** deterministic, derived, non-binding — no LLM decides money/eligibility/state (E12).
- **Anti-clone / integrity:** rate limiting (route-aware), the P0 security regression suite (S01–S23),
  and the public-API contract gate all remain green in CI.

## 5. Deployment checklist (per phase, pack doc 14 §Deployment)

Migrations (additive) · env vars · flags (default OFF) · staging validation · smoke (the per-phase
`test:*` E2E) · monitoring · rollback (flag-disable). Deployment stays on Vercel (web) / Railway
(API + worker); the stack is Hostinger-portable (standard Node/Nest/Next, Postgres, Redis/S3
adapters, env config, health checks).

## 6. Outstanding owner actions (gate specific binding paths, not builds)

O1 (operator/terms) · O2 (auction licensing) · O3 (tax values) · O4 (payment providers) · O5 (FX
provider) · O6 (logistics provider/ports) · O7 (KYC/licence requirements) · O8 (public rollout /
DNS / Hostinger). Until each is verified, the corresponding capability stays flag-off and any binding
path returns `MANUAL_REVIEW_REQUIRED`. None blocks the codebase; all are tracked in
`SINGHA_EVOLUTION_STATE.md`.

## Verdict

**E14 PASS** — compatibility guards automated and green; rollback posture documented; legacy
retirement recorded with nothing destructively removed; security posture consolidated. The platform
is ready for the E15 controlled-pilot go/no-go, subject to the owner actions above.
