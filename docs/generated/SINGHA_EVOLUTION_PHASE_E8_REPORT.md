# SINGHA EVOLUTION — PHASE E8 REPORT (Fees / Tax / Rules engine + Payment orchestration)

**Verdict: E8 PASS** — additive, behind the default-OFF `feesEngine` / `operatorPayments` flags.
Baseline BE `60e1073` → this phase, shipped in two increments: **E8a** = the versioned, deterministic
Fees / Tax rules engine; **E8b** = payment orchestration (regulated-route resolution + signed,
idempotent webhooks). Tax rule _values_ (O3) and payment providers (O4) are owner-gated: unverified
config yields a non-binding preview — the engines are fully buildable and shipped now.

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

## E8b delivered (payment orchestration)

- **Pure domain** (`payments.ts`, 5 tests) — `resolvePaymentRoute`: deterministic, operator-scoped,
  most-specific-wins resolution to an **external regulated** provider (there is deliberately no
  internal-ledger/escrow provider kind). An unverified/unlicensed route → non-binding preview (O4);
  no route → `MANUAL_REVIEW_REQUIRED`. Bank-transfer / offline routes flag `requiresManualSettlement`
  (Singha holds no balance).
- **Schema** — three additive tables (`payment_route` config, `payment_intent` snapshot,
  `payment_webhook_event` idempotency) via migration `20260815170000_evolution_e8b_payments`
  (`CREATE TABLE` × 3 + indexes, **zero** DROP/RENAME/ALTER).
- **API** (`modules/payments`, flag-gated `operatorPayments`) — `POST /payments/resolve-route`
  (`exchange:operate`) resolves + persists an intent; `POST /payments/webhook` is public but
  **HMAC-SHA256 signature-verified** (constant-time) and **idempotent** (UNIQUE provider+eventId —
  a replay is a no-op). No money moves; settlement happens on the external provider.
- **Config** — `operatorPayments` flag (default OFF) + server-only `PAYMENT_WEBHOOK_SECRET`.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **158** tests (7 fees + 5
  payments) + `@singha/contracts` 25 + `@singha/api` **46** (3 fees + 4 payments specs) +
  `@singha/config` 14; `lint` **0 errors**; `format:check` clean. Real-Postgres E2E
  `scripts/e2e-fees.mjs` + `scripts/e2e-payments.mjs` (both wired into their `test:*` scripts + the
  acceptance chain + CI steps) prove the fee breakdown + reproducibility + O3 preview, and the
  regulated-route resolution + O4 preview + signed/idempotent webhooks + server-side authorisation.
- **No unlicensed banking:** routes reference external regulated providers only; Singha persists a
  routing _intent_, never a balance/ledger. Webhooks are signed + idempotent.
- **Migration safety:** additive-only (five new tables across E8a+E8b); existing tables untouched.

## Owner actions (non-blocking)

- **O3 — tax/VAT/GST values per jurisdiction/method.** The fee/tax engine is live; unverified tax
  rules return `MANUAL_REVIEW_REQUIRED` until the owner confirms the values.
- **O4 — regulated payment/settlement providers + credentials per operator.** The route resolver is
  live; unverified routes return `MANUAL_REVIEW_REQUIRED` until the owner verifies each route.

## Next

**E9** — Procurement / Wanted / RFQ / Reverse Tender (the two-sided market), reusing the E4 offer
engine and E6 routing.
