# SINGHA AUCTIONS V2 — CLAUDE CODE MASTER INSTRUCTIONS

## Mission
Build Singha Auctions V2 as a fresh, production-grade auction, asset exchange, live-auction, omnichannel communications and asset-intelligence platform.

V1 is a reference and migration source only. Do not inherit V1 architecture blindly.

The human developer must not be required to translate the product owner's ideas into technical requirements. This pack is the technical translation. Claude Code is expected to perform most routine architecture, coding, testing, documentation and implementation planning.

Read all files in `/docs` before implementing a domain they govern.

## Product modules
- **Singha Exchange** — timed auctions, EOI, Buy Now, Make Offer, sealed tender, live/hybrid.
- **AuctionFlow** — Rubik-inspired Cube/Grid/List catalogue and buyer command-centre dashboard.
- **Singha Live** — direct broadcast, multi-camera, auctioneer/clerk/producer consoles, SE.lk live room, YouTube simulcast, recording/replay.
- **Singha Connect** — WhatsApp, Facebook/Instagram messaging, email, SMS, web/app chat and future voice.
- **Singha AI Core** — listing creation, media assistance, support, recommendations, translation, staff copilot.
- **Singha Buyer Twin** — rebuildable customer/purchase intelligence.
- **Singha Asset Intelligence** — comparables, analytics, price/demand intelligence and Market Pulse.
- **Singha Social Publisher** — AI-assisted Facebook/Instagram creatives and campaigns.

## Non-negotiable rules
1. Permanent customer, asset, bid, auction, payment, settlement and audit data must survive V3/V4/V5 application rewrites.
2. UI is never the source of truth for auction state.
3. AI outputs are derived records and never overwrite original facts, media, bids or financial history.
4. Original media is immutable; enhanced media is a derivative.
5. Bid and financial ledgers are append-only or strongly immutable.
6. Use versioned contracts and additive-first migrations.
7. Use transactional outbox/event-driven integration between domains.
8. Put external providers behind adapters.
9. Enforce authorization on the server.
10. No destructive production migration without expand-migrate-verify-contract.
11. Free-text AI interpretation may create a bid intent only; accepted bids require explicit confirmation and auction-engine validation.
12. Singha's auction engine is authoritative; YouTube/social channels are communication/distribution surfaces.
13. Homepage is editorial and lightweight: hero + featured items + featured event + categories + Market Pulse. No full catalogue.
14. Catalogue supports Cube, Grid and List.
15. Critical workflows require automated and end-to-end tests.

## Autonomy policy
Do not ask the developer to make routine technical decisions.

Proceed autonomously when the decision is reversible, internal, covered by this pack, and consistent with security/data safety.

Record meaningful decisions in `docs/generated/DECISIONS.md`.

Escalate only:
- credentials/account access;
- legal/compliance wording;
- business fees or policies not supplied;
- irreversible production-data changes;
- paid vendor/contract approvals;
- DNS/domain ownership;
- real secret rotation;
- decisions that contradict this pack.

If a business value is unknown, make it configurable and use a safe placeholder rather than blocking implementation.

## Default architecture direction
Prefer a TypeScript-first monorepo:
- Next.js + React + TypeScript for web/PWA.
- NestJS + TypeScript for API.
- PostgreSQL authoritative database.
- Redis for caching, active state, locks/rate controls and queues where appropriate.
- BullMQ or equivalent jobs.
- OpenSearch/Meilisearch through an adapter.
- S3-compatible object storage.
- WebSocket/SSE adapter for realtime.
- Transactional outbox + internal event bus initially.
- Structured logs, metrics, traces and error monitoring.
- Unit + integration + database + E2E tests.

Pin current stable versions at implementation time after checking official docs. Do not hardcode historical versions.

## Modular-monolith first
Do not begin with dozens of microservices. Build a strongly modular monolith with explicit domain boundaries, contracts and outbox events. Extract later only when justified.

## Required generated project docs
Maintain:
- `docs/generated/ARCHITECTURE_STATUS.md`
- `docs/generated/DECISIONS.md`
- `docs/generated/IMPLEMENTATION_STATUS.md`
- `docs/generated/DATA_MIGRATION_STATUS.md`
- `docs/generated/TEST_MATRIX.md`
- `docs/generated/INTEGRATION_STATUS.md`

Do not declare production readiness until the acceptance specification passes.
