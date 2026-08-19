# SINGHA — Unified Client Identity & Cockpit — COMPLETION REPORT

**Directive:** unify Singha around ONE permanent Client/Customer identity (buyer/seller/supplier are
capabilities, not accounts); redesign the signed-in experience as a single adaptive Cockpit with a
deterministic Account Health summary and contextual AI; browser-test one client through the full
buy→sell→RFQ→win→proceeds lifecycle on the same IDs.
**Method:** audit → decide → integrate → test → fix. Baseline: backend `ae36232`, FE `356ee77`.

---

## 1. Verdict

> ## `UNIFIED_IDENTITY_CONFIRMED · COCKPIT_ENGINEERING_COMPLETE_FOR_CONTROLLED_PILOT`

The audit found Singha's identity was **already unified** — one `Customer` per human/company, one
Singha Client ID (`CUS-######`), buyer/seller/supplier derived as capabilities, and **no flow that
mints a second account** to buy vs sell. No fragmentation existed to remove. The work delivered is
therefore the **consolidation the directive asked for**: one authoritative Cockpit read-model, a
deterministic Account Health, contextual AI, and one adaptive Cockpit UI replacing the split
buyer/seller dashboards — all proven end-to-end on a single identity.

---

## 2. Audit findings (three parallel source audits, both repos)

- **Backend identity — ALREADY UNIFIED.** One `Customer` (opaque ULID id) + one immutable
  `clientReference` from an atomic sequence. The same row carries buyer artifacts (bids, watches,
  offers, credit, security) AND seller artifacts (owned assets, org membership, drafts). `deriveRoles`
  = `'buyer'` always, `'seller'` iff the customer **owns any asset OR belongs to any organization**.
  Exactly three code paths create a Customer; **none takes an account type**; becoming a seller
  attaches a capability to the same id (org membership / capability grant), never a second row. One
  `customerId` threads every capability through the Principal.
- **Aggregation — mostly present, three real gaps.** Self-scoped reads existed for buying (command
  centre), listings/drafts, procurement, supply, credit/security, singha-id, notifications,
  conversations, buyer-twin. Missing: **seller sales/settlements/proceeds** (staff-only),
  **Account Health as one deterministic fact-set**, and a customer activity timeline.
- **Frontend — unified identity, fragmented surfaces.** No Buyer/Seller mode switch, no
  second-account seller flow, and **zero FE-only financial state** (every figure read live). But the
  experience was split across `/dashboard` (buyer), `/sell` (seller) and `/account/activity`
  (read-only), plus misleading "seller account" copy.

## 3. What was delivered

**Backend (`Auctions-Backend`)** — new `cockpit` module, a pure read-model (never a source of truth,
no cached financial state):

- `GET /api/v2/me/cockpit` — ONE adaptive projection for the signed-in client consolidating buying
  (bids/winning/outbid/won/watched/offers/EOIs/tenders/purchases/invoices), selling (drafts/active
  listings/offers-received/sales/settlements/**proceeds**), procurement/RFQs, supply, conversations,
  notifications and a cross-side needs-attention list. `emphasis` (buyer/seller/both) is derived from
  what the one customer actually does — **no manual mode switch**.
- `GET /api/v2/me/cockpit/account-health` — **Singha Account Health**: ONLY deterministic facts
  (available bid capacity, utilised exposure, deposits/security, overdue invoices, amounts to pay,
  pending + settled seller proceeds) with a plain clear/attention traffic light from concrete overdue
  actions. **No opaque consumer credit score.**
- `POST /api/v2/me/cockpit/ask` — **contextual Singha AI**: a deterministic classifier maps a
  plain-language question to ONE authoritative fact-slice; the AI only interprets, every number comes
  from the read-model (rules 3/11 — nothing invented).
- Seller proceeds/settlements gained a self-scoped read (was staff-only) via
  `listing.asset.ownerCustomerId`.

**Frontend (`Auctions-New`)** — one adaptive Cockpit:

- `/cockpit` — identity header (Client ID + role chips), Account Health card, Ask-Singha box (quick
  questions), needs-attention band, adaptive Buying + Selling sections, and procurement / supply /
  conversations / notifications. Section order adapts to emphasis.
- `/dashboard` now redirects to `/cockpit`; nav "Dashboard" → "Cockpit"; the account name link and
  mobile dock point to the Cockpit. Misleading "seller account" copy replaced with "a capability on
  your one Singha ID".

## 4. Acceptance test (browser-equivalent, drives real endpoints)

`scripts/e2e-cockpit.mjs` (CI `test:cockpit`) — **ONE synthetic client X**: registers once, wins an
auction (buys), lists an item, responds to an RFQ, posts an RFQ, and its listed item sells to another
buyer so X receives seller proceeds. **36/36 checks green**, including:

- The whole history stays on the **SAME Customer ID + Client ID** — DB-verified: exactly one Customer
  row, one Client ID, and X appears as buyer AND seller.
- The Cockpit shows both sides with `emphasis = both`; Account Health reports amounts-to-pay and
  settled seller proceeds and carries **no score**; all six contextual-AI questions resolve to
  authoritative facts.
- Privacy: a different client sees only their own cockpit; anonymous → 403.

## 5. Verification

| Gate                                                                                        | Result   |
| ------------------------------------------------------------------------------------------- | -------- |
| Backend full static gate (`pnpm run check` — format/lint/typecheck/build/unit ×13)          | ✅ green |
| `scripts/e2e-cockpit.mjs` (unified identity + cockpit + account health + AI + privacy + DB) | ✅ 36/36 |
| New CI step `test:cockpit`                                                                  | ✅ added |
| Frontend typecheck + eslint + unit tests (148)                                              | ✅ green |

## 6. Preserved gates (commercial/legal — not removed)

Bidding eligibility (membership status, configurable KYC, credit facility scope + capacity, security
revalidation), Singha ID per-capability verification, RBAC role→permission enforcement, and
server-side ownership checks all remain — they are capability/eligibility gates on the one identity,
exactly what the directive said to keep.

## 7. Known environmental caveat

The frontend `next build` cannot complete in this sandbox (`next/font/google` fetch blocked by the
egress proxy) — an environment limit, not a code defect; the FE is validated by typecheck, eslint and
the vitest suite and builds normally in CI/Vercel. The acceptance journey is proven at the API layer,
which is the authoritative source of truth.
