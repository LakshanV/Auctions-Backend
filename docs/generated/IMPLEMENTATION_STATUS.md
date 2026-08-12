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

## Revision 06.2 — credit integrity + member search (PARTIAL — result NO_GO)

_2026-08-12. `main` commits `240ef09` (search), `4c9e3b4` (§3), `6b6d269` (§5),
`45aa2b8` (§8). Verified via `pnpm test:member` (all checks pass) + api typecheck/lint._

**Done + verified (`COMPLETE_VERIFIED` locally):**
- **§12 staff member search** — `GET /api/v1/members/search?q=&limit=` (`member:read`):
  Client ID / mobile / email / legal name / organisation; exact Client ID ranked first;
  contact masked; raw contact never returned; public/customer denied (403).
- **§3 (P0) converted unpaid exposure** — bid admission now counts ACTIVE **+ CONVERTED**
  (won-but-unpaid) via one canonical `committedExposureMinor`; a winner cannot regain
  capacity for a new bid until payment/release. Regression: winner 10m, 8m converted →
  new over-limit bid `CREDIT_LIMIT_EXCEEDED`, in-limit bid accepted.
- **§5 (P0) security-release blocking** — `releaseSecurityInstrument` locks the facility
  row (serialises with the bid gate, §7-C) and blocks with `OUTSTANDING_EXPOSURE` (409)
  while ACTIVE/CONVERTED exposure remains; allowed once cleared; unauthorised 403.
- **§8 credit policy** — public `GET /members/credit-policy` (requiredSecurityBps /
  enforcement / policyVersion / capacityMultiple) from BusinessConfig, default 5%.

**Still OPEN (why result is `NO_GO`):**
- **§4 (P0) temporary facility SCOPE enforcement** — the gate locks the first active
  facility; it does not yet resolve auction→event or enforce PLATFORM/EVENT/AUCTION scope
  at bid time. `NOT_STARTED`.
- **§6 (P0) security-expiry revalidation** — gate checks facility expiry, not the
  underlying instrument's validity/recalculation; no background recalc worker. `PARTIAL`.
- **§7 Race B/C** — mechanisms exist (converted counted at admission; facility-row lock on
  release) and §3/§5 exercise them, but dedicated concurrent race B/C tests are not added.
- **§9 explicit capacity mode**, **§10 central KYC/eligibility evaluator**,
  **§11 exposure on other binding sale methods** (Buy Now / Make Offer / Tender / Live) —
  `PARTIAL`/`NOT_STARTED`.
- **Deploy** — not pushed; Railway/production smoke pending owner action.

Per §24/§25, Rev 06.2 is **NO_GO** while §4/§6 P0 items remain open and nothing is deployed.
