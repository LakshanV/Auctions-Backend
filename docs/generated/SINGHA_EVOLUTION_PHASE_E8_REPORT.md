# SINGHA EVOLUTION — PHASE E8 REPORT (Fees / Tax / Rules engine + Payment orchestration)

**Verdict: E8a PASS** (the versioned, deterministic Fees / Tax rules engine). Additive, behind the
default-OFF `feesEngine` flag. Baseline BE `60e1073` → this phase. Payment orchestration is **E8b**
(see "Remaining"). Tax rule _values_ are owner-gated (register O3): an unverified applied rule
yields a non-binding preview — the engine itself is fully buildable and shipped now.

## E8a delivered

**Contracts** (`@singha/contracts` `fees-domains.ts`) — `chargeComponents` (buyer_premium,
seller_commission, platform_fee, method_fee, freight, tax, inspection, certification, documentation,
storage, export_admin, other), `chargeSides`, `chargeBases` (PERCENT/FIXED), `chargeAppliesTo`
(PRINCIPAL/BUYER_SUBTOTAL); `computeChargesRequest` / `chargeLine` / `chargesResult`.

**Pure domain engine** (`@singha/domain` `modules/fees`, 7 tests) — the money core:

- `computeCharges` — versioned, **deterministic**, **float-free** (exact integer minor units,
  half-up; D5/D6). **Exactly one rule applies per component** (most-specific → priority → code →
  version), so charges never double-count. Buyer non-tax fees apply to the principal; **tax** applies
  to the principal or the buyer subtotal per its `appliesTo`; **seller commission** is deducted from
  the seller's proceeds. Value-band (`min/maxPrincipalMinor`) rules apply only within range.
- **Reproducibility (pack §10):** every computed line records the applied rule **code + version +
  rate**, so an old transaction is reproducible after the rules change.
- **O3 / D7:** an unverified applied rule (especially tax) makes the whole breakdown a non-binding
  `MANUAL_REVIEW_REQUIRED` preview — it never becomes an automatic binding charge.

**Schema** — two additive tables (`fee_rule` versioned config, `fee_breakdown` append-only computed
snapshot with per-line applied rules); migration `20260815160000_evolution_e8a_fee_rules` is
`CREATE TABLE` × 2 + indexes, **zero** DROP/RENAME/ALTER.

**API** (`modules/fees`, flag-gated `feesEngine`, `exchange:operate`) — `POST /api/v1/fees/compute`
computes + persists a `FeeBreakdown`. No money moves; this is deterministic computation + an audit
snapshot the binding path (E8b / commerce) will consume.

**Runtime flag** `feesEngine` (default **OFF**) across `@singha/config` (3 files) + the DB
`FeatureFlag` seed.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **153** tests (7 fees) +
  `@singha/contracts` 25 + `@singha/api` **42** (3 fees specs) + `@singha/config` 14; `lint` **0
  errors** (3 pre-existing e2e-script warnings); `format:check` clean. Real-Postgres E2E
  `scripts/e2e-fees.mjs` (wired into `test:fees` + acceptance chain + a CI step) seeds versioned
  rules and proves the full breakdown (premium + fixed fee + tax-on-subtotal + seller commission =
  buyer 132,250 / seller proceeds 92,000), per-line reproducibility, the unverified-tax preview
  (O3), most-specific-rule-wins (no double-charge), no-match zeros, and server-side authorisation.
- **Money integrity (D5/D6):** exact integer minor units, pure code, no float, no LLM. One rule per
  component — deterministic and reproducible.
- **Migration safety:** additive-only (two new tables); existing tables untouched.

## Remaining in E8 (E8b)

- **Payment orchestration** (pack §10): resolve a regulated payment route from operator / currency /
  locations / transaction type / provider eligibility (one UX, operator-specific routes) —
  **without** creating unlicensed internal banking/escrow. A `PaymentRoute` config + a deterministic
  resolver returning the route or `MANUAL_REVIEW_REQUIRED`/`OPERATOR_PAYMENTS`-gated (owner O4).
  Signed/idempotent webhook intake. Persist the fee breakdown against the transaction at bind time.

## Next

Finish **E8b** (payment orchestration), then **E9** — Procurement / Wanted / RFQ / Reverse Tender
(the two-sided market), which reuses the E4 offer engine and E6 routing.
