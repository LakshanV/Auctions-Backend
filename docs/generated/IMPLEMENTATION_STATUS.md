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
