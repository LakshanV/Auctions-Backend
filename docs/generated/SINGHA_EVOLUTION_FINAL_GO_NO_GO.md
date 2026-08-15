# SINGHA EVOLUTION — FINAL GO / NO-GO (E15)

**Program:** evolve the auction-led product into a geography-neutral, category-neutral, multi-operator
platform for physical assets **and** commodities under **Singha**, without a rewrite.

## Verdict

- **Controlled internal pilot: GO (conditional).** All engineering phases E0–E14 are PASS; every new
  capability is additive, flag-gated (default OFF), and CI-green. A controlled pilot may enable the
  flags in **staging** and exercise the non-binding surfaces per the plan in §4.
- **Public binding launch: NO-GO until the owner gates clear.** Binding paths (real operator terms,
  tax values, regulated payments, live FX/logistics, KYC bars, public rollout) depend on owner
  actions **O1–O8**; until each is verified those paths return `MANUAL_REVIEW_REQUIRED` by design.
  Public GO also requires the pre-launch checklist in §5 and final owner sign-off.

## 1. Phase completion (E0–E14 all PASS)

| Phase   | Scope                                                    | Status  |
| ------- | -------------------------------------------------------- | ------- |
| E0–E1   | Audit/baseline + brand + geography-neutral IA            | ✅ PASS |
| E2–E3   | Operator/Market/Node config + universal Listing          | ✅ PASS |
| E4      | Commercial Offer Engine V2 (immutable revisions, sealed) | ✅ PASS |
| E5–E6   | Currency/FX display + Transaction Routing + Terms        | ✅ PASS |
| E7–E8   | Logistics/Incoterms + Fees/Tax + Payment orchestration   | ✅ PASS |
| E9–E10  | Procurement/RFQ/Reverse Tender + Supply Programmes       | ✅ PASS |
| E11     | Singha ID + Dashboard + Control Centre                   | ✅ PASS |
| E12–E13 | Intelligence expansion + Satellite Market Node + SEO     | ✅ PASS |
| E14     | Hardening / compatibility guards / legacy-retirement     | ✅ PASS |

Full per-phase detail in `SINGHA_EVOLUTION_STATE.md` and `SINGHA_EVOLUTION_PHASE_E*_REPORT.md`.

## 2. Acceptance criteria (pack doc 16) → evidence

**Product**

- Browse multiple locations, no "Global" silo — E1 neutral IA + E13 node presets (All Locations).
- Display currency never alters contractual currency — E5 (`binding:false`) + E13 canonical strips
  display currency. Evidence: `test:fx`, `test:node`.
- New category needs no core redesign — E3 universal Listing + category schemas.
- New operator is configuration-driven — E2 config + E6 routing. Evidence: `test:routing`.
- Auction is one method, not required for all commerce — E2/E3 sale-method codes (D3).

**Offer** (Evidence: `test:offers`)

- Complete proposal stored immutably; counters create revisions; sealed values do not leak; the
  highest sealed proposal is **not auto-awarded** (D4); acceptance is atomic/idempotent → exactly one
  Sale; history intact. The never-auto-award rule is re-proven in `test:procurement`, `test:supply`
  and `test:insight`.

**Routing** (Evidence: `test:routing`)

- Deterministic, explainable output; applied rule versions persisted; no valid route →
  `MANUAL_REVIEW_REQUIRED`; no hard-coded country forest (table-driven, specificity-scored).

**UX** — universal cards/item pages across vehicle/produce/scrap/gem/machinery/property; Singha /
Singha Exchange language (Auction only when precise); premium V3 quality preserved. Owned in the
frontend repo (E1 + V3 design system + screenshot matrix).

## 3. Owner-action gates (O1–O8)

| #   | Needed decision / credential                          | Unblocks                         |
| --- | ----------------------------------------------------- | -------------------------------- |
| O1  | Legal entity + operator contracts per market          | E6 binding terms, invoices       |
| O2  | Auction licensing eligibility per market              | E-auction enablement             |
| O3  | Tax/VAT/GST conclusions per jurisdiction/method       | E8 tax rule values               |
| O4  | Regulated payment/settlement providers + credentials  | E8b real settlement              |
| O5  | FX provider + credentials                             | E5 live FX (fake/adapter ready)  |
| O6  | Logistics provider(s) + credentials; port master data | E7 live quotes (structure ready) |
| O7  | KYC/licence requirements per activity/market          | E11 verification evidence bar    |
| O8  | Public rollout approval; DNS/hosting; Hostinger move  | E15 public GO                    |

Until each clears, the capability stays flag-off (or non-binding) and browse/staging still works.

## 4. Controlled-pilot enablement plan (staging)

Enable flags in dependency order, running the matching smoke E2E after each and monitoring; roll back
by disabling the flag (no schema change).

1. **Foundations & catalogue** — `multiOperator`, `structuredLocations`, `quantityUnits`,
   `saleMethodConfig` → `test:e2e`.
2. **Commercial core** — `commercialOffersV2`, `sealedOffers` → `test:offers`.
3. **Money & routing** — `multiCurrency`, `fxDisplay`, `transactionRouting` → `test:fx`,
   `test:routing`.
4. **Fulfilment** — `logistics`, `logisticsQuotes`, `feesEngine`, `operatorPayments` →
   `test:logistics`, `test:fees`, `test:payments`.
5. **Two-sided market** — `procurement`, `supplyProgrammes`, `perishableGoods` → `test:procurement`,
   `test:supply`.
6. **Identity & surfaces** — `singhaId`, `dashboard`, `controlCentre` → `test:singha-id`,
   `test:dashboard`.
7. **Intelligence & nodes** — `insightEngine`, `satelliteNodes` → `test:insight`, `test:node`.

The full chain is `pnpm run test:acceptance` (every phase E2E against an ephemeral Postgres). Binding
paths stay `MANUAL_REVIEW_REQUIRED` until the relevant O# is verified, so the pilot is safe to run
with real users on browse/preview flows.

## 5. Pre-public-GO checklist (pack doc 14)

Production load/soak · backup + isolated restore drill · security scans (the S01–S23 suite already
gates CI) · regulated-provider activation tests (O4/O5/O6) · accessibility review · monitoring/alerting
· final owner approval (O8). Deployment stays Vercel (web) / Railway (API+worker); Hostinger-portable.

## 6. Standing invariants (enforced automatically — E14)

Additive-only migrations and default-OFF flags are now **CI-guarded** (`test` in
`database`/`config`), so the platform cannot regress into a destructive migration or a silently-live
capability. Money is exact integer minor units; binding records are append-only and **central** (no
per-country ledger, Addendum A); AI/intelligence is deterministic, derived and non-binding.

**Recommendation:** proceed to the controlled internal pilot now; schedule the owner-action reviews
(O1–O8) and the pre-launch checklist as the gate to public binding launch.
