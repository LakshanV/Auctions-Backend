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
