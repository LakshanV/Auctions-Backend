# SINGHA EVOLUTION — PHASE E9 REPORT (Procurement / Wanted / RFQ / Reverse Tender)

**Verdict: E9 PASS** — additive, behind the default-OFF `procurement` flag. Baseline BE `74b4a38`
→ this phase. E9 adds the **buyer-initiated two-sided market**: a buyer posts a demand (RFQ /
Request-Supply / reverse tender), suppliers submit commercial proposals, and the buyer awards **one
explicitly**. The non-negotiable it enforces: a procurement award is **never automatic** — matching
ranks/recommends (cheapest first), but a human buyer selects the winner (pack §09; consistent with
DECISIONS **D4**, the same "sealed/selection never auto-binds" rule the E4 offer engine holds).

## Delivered

**Contracts** (`@singha/contracts` `procurement-domains.ts`) — `procurementRequestTypes`
(`RFQ`, `REQUEST_SUPPLY`, `REVERSE_TENDER`), `procurementStatuses` (`open`/`closed`/`awarded`/
`cancelled`), `procurementProposalStatuses`; `createProcurementRequestSchema` (type, title,
category, specification, Decimal quantity + unit, destination, delivery-by, currency, payment terms,
operator, submission-close); `submitProcurementProposalSchema` (reuses the E4 `offerProposalSchema`
for the commercial terms + notes); `awardProcurementSchema` (**`selectedProposalId` required** — an
award cannot be requested without naming the winner).

**Pure domain engine** (`@singha/domain` `modules/procurement`, 7 tests) — the selection core:

- `PROCUREMENT_TRANSITIONS` + `assertProcurementTransition` — `open → {closed, cancelled}`,
  `closed → {awarded, cancelled, open}` (a wrongly-closed window can reopen), `awarded`/`cancelled`
  terminal. Illegal moves throw `IllegalTransition` (→ HTTP 409).
- `procurementParticipation` / `rankProcurementProposals` — participation counts and a **cheapest-
  first ranking that is a RECOMMENDATION only** (exact `bigint` compare, deterministic id tie-break;
  withdrawn/unpriced excluded). Uses the E4 `comparableHeadlineMinor` so total- and unit-priced
  proposals compare on one axis.
- `selectProcurementWinner` — the heart of E9's "never auto-award": it **requires** the request to
  be `closed` **and** an explicit `selectedProposalId`, and returns exactly the chosen proposal
  (which may not be the cheapest — a buyer may prefer terms/quality/delivery). No arguments produce an
  automatic winner.

**Schema** — two additive tables (`procurement_request`, `procurement_proposal`); migration
`20260815180000_evolution_e9_procurement` is `CREATE TABLE` × 2 + indexes, **zero**
DROP/RENAME/ALTER on existing tables. Money is `BigInt` minor units; quantity is `Decimal(38,9)`.

**API** (`modules/procurement`, flag-gated `procurement`, `exchange:participate`) — a buyer
`POST /api/v1/procurement/requests` (owns it), suppliers `POST .../requests/:id/proposals` while
open, the owning buyer `POST .../requests/:id/close` then `POST .../requests/:id/award`
(`selectedProposalId`). `GET .../requests/:id/proposals` returns the ranked recommendation + counts
to the **owner only**; `GET .../requests/mine` lists the buyer's requests. Ownership is enforced on
every management/read route (a non-owner gets 403); the award marks the winner `accepted` and the
rest `rejected` atomically via the existing `UnitOfWork` (+ audit event).

**Runtime flag** `procurement` (default **OFF**) across `@singha/config` (3 files) + the DB
`FeatureFlag` seed.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **165** tests (7 procurement) +
  `@singha/contracts` 25 + `@singha/api` **47** (1 procurement flag-gating spec) + `@singha/config`
  14; `lint` **0 errors** (pre-existing e2e-script warnings only); `format:check` clean. Real-Postgres
  E2E `scripts/e2e-procurement.mjs` (wired into `test:procurement` + the acceptance chain + a CI step)
  proves: a buyer posts an RFQ (open); three suppliers submit; an **award before close → 409**; a
  non-owner **close → 403**; the buyer closes; proposals **rank cheapest-first (B, C, A) as a
  recommendation only**; a non-owner **view → 403**; the buyer awards the **DEAREST (A) explicitly**,
  proving the cheapest is never auto-awarded (§09 / D4); the DB confirms the request `awarded` to A,
  A `accepted`, and the cheapest loser `rejected`.
- **Never auto-award (§09 / D4):** `selectProcurementWinner` structurally refuses to return a winner
  without `closed` + an explicit selection; the e2e awards the most expensive proposal to prove the
  ranking is advisory, not binding.
- **Server-side authorisation (rule 9):** every request-management and proposal-view route is
  ownership-gated; participation requires `exchange:participate`; the whole surface 404s while the
  flag is OFF (unit spec).
- **Money integrity (D5/D6):** proposal prices are exact integer minor-unit `BigInt`; ranking is pure
  `bigint` compare, no float, no LLM.
- **Migration safety:** additive-only (two new tables); existing tables untouched.

## Owner actions (non-blocking)

- None specific to E9. Binding fulfilment of an awarded procurement (routing/terms/payment) flows
  through the already-shipped E6/E8 engines, which remain owner-gated (O1/O3/O4) and non-binding
  until verified. Procurement itself ships fully now behind its default-OFF flag.

## Next

**E10** — Supply Programmes (recurring/contract supply) + perishable-goods metadata.
