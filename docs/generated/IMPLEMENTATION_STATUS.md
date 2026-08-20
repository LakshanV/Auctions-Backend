# IMPLEMENTATION STATUS

_Phases 0–11 COMPLETE and verified; Phase 12 (hardening/launch) in progress._
Backend (this repo) is **feature-complete** against the pack. Frontend Phases 4–5
live in the `Auctions New` repo.

## Phase gates

| Phase | Scope                                                                  | Status   | Gate                                 |
| ----- | ---------------------------------------------------------------------- | -------- | ------------------------------------ |
| 0     | Monorepo, CI, observability, domain boundaries, design system          | ✅       | checks                               |
| 1     | Data core: identity/seller/asset/listing/media/audit/outbox + RBAC     | ✅       | permissions + migration + `test:e2e` |
| 2     | Timed auction engine (row-locked bids, proxy, soft-close, winner)      | ✅       | `test:auction`                       |
| 3     | EOI + Exchange (Buy Now / Make Offer / Sealed Tender)                  | ✅       | `test:eoi`, `test:exchange`          |
| 4     | Public site: AuctionFlow Cube/Grid/List + buyer dashboard              | ✅ (web) | typecheck + `next build`             |
| 5     | Seller listing wizard, seller dashboard, admin approvals               | ✅ (web) | typecheck + `next build`             |
| 6     | Commerce: invoice→payment→release→fulfilment→settlement, Evidence Pack | ✅       | `test:commerce`                      |
| 7     | Singha Connect (omnichannel + mock adapters; rule-11 bid intents)      | ✅       | `test:connect`                       |
| 8     | Singha AI Core (mock provider, derived records, no domain bypass)      | ✅       | `test:ai`                            |
| 9     | Social Publisher (mock Meta publishing)                                | ✅       | `test:social-intel`                  |
| 10    | Asset Intelligence / Market Pulse (derived read models)                | ✅       | `test:social-intel`                  |
| 11    | Singha Live (mock IVS/YouTube; one-ledger hybrid)                      | ✅       | `test:live`                          |
| 12    | Hardening / load / security / V1 migration / launch                    | 🚧       | acceptance                           |
| R05   | Member ID / Credit / Security / Performance engine (Revision 05)       | ✅       | `test:member` (+11 domain units)     |

## Acceptance

`pnpm test:acceptance` boots one throwaway Postgres, applies all migrations, and
runs **every** E2E suite in sequence — all green:
data-core, auction, EOI, exchange, commerce, connect, AI, social+intelligence, live.

## Credential-gated providers (mock adapters, swap via one DI binding)

- Connect channels (WhatsApp/Meta/SMS/email) → `MockChannelProvider`
- AI text/vision → `MockAiProvider`
- Social publishing (Meta Graph) → `MockSocialPublisher`
- Live ingest/simulcast (Amazon IVS / YouTube) → `MockLiveStreamProvider`

## Phase 12 — remaining, and what needs escalation

- Load testing (needs a target env), backup-restore drill, formal security review.
- **V1 → V2 data migration** — requires V1 export/DB access (developer/owner escalation).
- Real provider credentials (WhatsApp/Meta/AI/IVS/YouTube/payment gateway) —
  vendor accounts + secrets (escalation); adapters are ready.
- A production auth/IdP for staff/seller roles (dev uses `/dev/token` + demo login).

## Revision 05 — member / credit / security / performance engine ✅

Additive engine integrated into the proven auction engine via a narrow, concurrency-safe
credit-exposure gate (row-locks the facility so simultaneous bids cannot over-reserve).

- Client ID `CUS-######` / Org `ORG-######` via atomic Postgres sequences (resumable backfill).
- Configurable 5% (bps) security rule + eligibility + caps; pure BigInt math (no floats).
- Security instruments (cash / bank guarantee / spot deposit) with private documents.
- Credit facility with separate calculated / approved / uplift + append-only decision history.
- Temporary onsite membership (spot deposit → capacity → scoped/expiring grant).
- Deterministic, versioned, rebuildable performance rule engine (+ INSUFFICIENT_HISTORY).
- Private internal flags; AAL2 on sensitive commands; separate customer vs staff DTOs.

**Remote-green status (Rev 05 Truth Gate): PENDING PUSH.** Code committed to `main` and
locally green (`pnpm check`, `contract:check`, all E2E + `test:member`). GitHub Actions,
Railway deploy and production smoke run only after a human `git push` + Railway config
(see `RAILWAY_REQUIRED_CONFIGURATION.md`). Release gate = NO_GO until then.

## Revision 06.2 — credit integrity + member search (code-complete; deploy pending)

_2026-08-12. `main` commits `240ef09` §12, `4c9e3b4` §3, `6b6d269` §5, `45aa2b8` §8,
`6fdb730` §4, `5a25aa3` §6, `d793841` §11, `2d43ed0` §7/§10. Verified: `pnpm test:member`
(all checks) + `test:auction` + `test:commerce` + `test:exchange` green; api typecheck/lint._

**Done + verified (`COMPLETE_VERIFIED` locally):**

- **§3 (P0) converted unpaid exposure** — admission counts ACTIVE **+ CONVERTED** via one
  canonical `committedExposureMinor`; a winner can't regain capacity until paid.
- **§4 (P0) temporary facility SCOPE** — the gate locks ALL active facilities and selects
  the one covering this auction/event, most specific first (AUCTION → EVENT → PLATFORM,
  never aggregated); auction bids resolve their event. Auction & event scope enforced,
  expired grants `TEMPORARY_ACCESS_EXPIRED`, deterministic selection tested.
- **§5 (P0) security-release blocking** — release locks the facility row and blocks
  `OUTSTANDING_EXPOSURE` (409) while ACTIVE/CONVERTED exposure remains.
- **§6 (P0) security-expiry revalidation** — the gate re-derives the effective limit from
  currently-eligible security; a lapsed BG denies new exposure (`SECURITY_EXPIRED`) while the
  obligation is retained and available zeroed. _Transaction-time defence done; a background
  recalc/flag worker is a secondary operational enhancement (not correctness-critical)._
- **§7 races** — A (existing), B (via §3 counting), C (release vs concurrent bid serialised
  on the facility row; test asserts they never both succeed).
- **§8 credit policy** — public `GET /members/credit-policy` (bps / enforcement / kycPolicy /
  policyVersion / multiple) from BusinessConfig, default 5%.
- **§9 explicit capacity mode** — the `credit.enforcement` config (off / facility / strict)
  is the single explicit mode, surfaced via the policy endpoint; `strict` = every binding
  exposure needs a valid source.
- **§10 KYC/eligibility** — the exposure gate is the central deterministic evaluator with
  stable codes; a configurable KYC gate (`credit.kycPolicy`, default `off`) uses
  `KYC_REQUIRED` when policy requires it.
- **§11 exposure on binding non-auction sales** — Buy Now, accepted offer and awarded tender
  reserve/convert exposure via `reserveBindingSale`; a credit buyer's over-capacity Buy Now
  is `CREDIT_LIMIT_EXCEEDED`; commerce releases on payment; cash buyers unchanged.
- **§12 staff member search** — `GET /members/search` (`member:read`), exact Client ID first,
  masked contact, public/customer 403.

**Remaining for a formal GO (§24/§25):** push both repos + **deploy** (Railway/Vercel) and run
production smoke — owner action; and the optional §6 background recalc worker. All code is
committed to `main` and locally green.

## Cockpit / Dashboard vertical — explicit context + currency-grouped money (E11b)

`GET /dashboard` is now a complete, context-aware vertical.

- **Contract** — `packages/contracts/src/dashboard-domains.ts`: `dashboardQuerySchema`
  (`context` = `personal` (default) or `organization`, plus `organizationId`). An organization
  context REQUIRES `organizationId`; a personal context REJECTS it, so a request is never
  ambiguous about which book of record it is asking for (D-0055).
- **Controller** — `dashboard.controller.ts` validates the query through `ZodQuery`, so a bad
  context is a clean 400 rather than an unhandled error.
- **Service** — `dashboard.service.ts` resolves and AUTHORIZES the context before reading a row:
  personal needs an authenticated customer; organization needs a real `OrganizationMember` row for
  THAT organization, or the explicit `organization:manage` staff grant. A non-member is refused
  with 403 whether or not the organization exists (D-0056). The two contexts then query disjoint
  record sets — personal selling filters `sellerOrganizationId: null`, organization selling filters
  the organization id — so neither leaks into the other (D-0057). The resolved context is echoed
  back as `context` + `scope`, and sections with no attribution in the active context report empty
  with an explanatory `scope.notes` entry rather than borrowing the other context's rows.
- **Money** — new kernel helper `totalsByCurrency` (`packages/domain/src/kernel/currency-totals.ts`)
  returns `MoneyByCurrency` (`byCurrency[]`, `currencies[]`, `count`) with **no** scalar total, and
  accumulates through `Money.add`, which throws on a currency mismatch (D-0058). The cockpit's four
  aggregates — open offers, purchases, outstanding invoices, sales — are all grouped this way.
- **Preserved** — the personal `buying.watching` / `buying.offers` / `buying.procurementRequests` /
  `selling.supplyProgrammes` / `selling.procurementResponses` / `verification` sections are
  unchanged (they were already correctly scoped and carried no monetary totals); everything else is
  additive (`context`, `scope`, `money`, `buying.purchases`, `buying.invoices`,
  `selling.consignments`, `selling.sales`).
- **Tests** — `dashboard-domains.test.ts` (5), `currency-totals.test.ts` (8),
  `dashboard.test.ts` (9), `dashboard.service.spec.ts` (21, against an in-memory Prisma stand-in
  that applies the service's real `where` clauses), plus the extended `test:dashboard` E2E driver.
- **Not organization-attributed yet** — buy-side records (watchlist, offers, procurement requests,
  invoices, purchases), supply programmes, procurement responses and KYC capabilities carry no
  organization column in the schema today, so they remain personal-only. Adding a
  `buyerOrganizationId`-style column later populates the already-present, currently-empty sections
  without a contract change.

## Organization-attributed procurement requests (E9 + E11b)

The gap flagged at the end of the Cockpit vertical is closed: procurement requests now carry a real
organization attribution, so the organization Cockpit's procurement section is populated from the
organization's own book instead of reporting empty.

- **Schema + migration** — `ProcurementRequest.buyerOrganizationId` (nullable, FK to
  `organization`, indexed) plus an index on `buyerCustomerId`. Migration
  `20260820100000_procurement_buyer_organization` is **expand-only**: the column is nullable with no
  default and no backfill, so every existing row stays exactly what it was — a personal request — and
  an older application version that does not know the column keeps working (docs/04
  expand-migrate-verify-contract).
- **Contract** — `createProcurementRequestSchema` and the new `procurementRequestsQuerySchema` both
  carry the explicit acting context. The shape rules moved to
  `packages/contracts/src/actor-context.ts` (`withActorContext`) and are now shared with
  `dashboardQuerySchema`, so every context-aware route obeys one rule set (D-0061).
- **Authorization** — `apps/api/src/shared/auth/actor-context.ts` holds the single implementation of
  `resolveActorContext` (create/read context), `isActingForOrganization` (record-driven management)
  and `buyerScopeFilter` (the disjoint `where` fragment). `DashboardService` now delegates to it
  rather than carrying its own copy.
- **Creation** — `context: 'organization'` is authorized BEFORE the row is written and stamps
  `buyerOrganizationId` durably (D-0059); `buyerCustomerId` still records who acted. The default
  personal context can never attribute a request to an organization.
- **Reads** — `GET /procurement/requests/mine` takes the same context and returns
  `{ context, requests }`. Personal pins `buyerOrganizationId: null`; organization pins the id and
  drops the customer filter, so a colleague's request is included and no personal request ever is.
- **Management** — close / award / read-proposals authorize against the book the RECORD belongs to
  (D-0060): any member of the attributed organization (or `organization:manage` staff) may act, and
  no organization membership can reach a personal request.
- **Cockpit** — the personal context filters `buyerOrganizationId: null`; the organization context
  reads `buyerOrganizationId = <id>`. The organization cockpit's `scope.notes` no longer claims
  procurement requests are personal-only.
- **Tests** — `procurement.service.spec.ts` (25) and `dashboard.service.spec.ts` (23) run against an
  in-memory Prisma stand-in that applies the services' real `where` clauses;
  `actor-context.test.ts` (26) runs one rule table across every context-aware schema; the
  `test:procurement` and `test:dashboard` E2E drivers cover the same invariants over HTTP with a DB
  assertion on the stamped column.
