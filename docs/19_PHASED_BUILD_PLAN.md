# 19 — PHASED BUILD PLAN FOR CLAUDE CODE

## Phase 0 — Foundations
Claude:
- initializes/inspects monorepo;
- configures lint/type/test/build;
- local PostgreSQL/Redis;
- observability baseline;
- generated docs;
- domain boundaries;
- CI.

Gate: all checks pass.

## Phase 1 — Stable Data Core
Build:
- identity/customer;
- organizations/sellers;
- assets;
- listings;
- category schemas;
- media/docs;
- audit;
- outbox.

Gate: permissions + migration tests.

## Phase 2 — Timed Auction Engine
Build:
- auction config;
- bid ledger;
- increments;
- reserve;
- proxy;
- concurrency;
- soft close;
- realtime;
- close/winner.

Gate: concurrency/soft-close E2E.

## Phase 3 — EOI + Exchange
EOI fully.
Scaffold feature-flagged Buy Now, Make Offer, Tender.

Gate: EOI E2E.

## Phase 4 — Public Site + AuctionFlow
- artistic homepage;
- featured items;
- category/search;
- Cube/Grid/List;
- lot page;
- buyer dashboard;
- Market Pulse placeholder.

Gate: accessibility/performance.

## Phase 5 — Seller/Admin
- listing wizard;
- approvals;
- seller dashboard;
- admin;
- roles/permissions.

## Phase 6 — Commerce
- invoices;
- payments;
- receipts;
- release;
- fulfilment;
- settlement;
- Evidence Pack.

Gate: full transaction E2E.

## Phase 7 — Singha Connect
Provider-independent conversation core + mocks first.
Real adapters when credentials arrive.

## Phase 8 — Singha AI Core
- model registry;
- tools;
- AI run/provenance;
- listing drafts;
- assistant;
- safe media;
- Buyer Twin;
- recommendations.

Gate: AI cannot bypass deterministic domains.

## Phase 9 — Social Publisher
- publication model;
- templates;
- individual/group campaigns;
- AI draft;
- mock publishing;
- real Meta adapters after access.

## Phase 10 — Asset Intelligence
- analytics pipeline;
- comparables;
- Market Pulse;
- source-backed news ingestion.

## Phase 11 — Singha Live
- live event domain;
- bidder room;
- auctioneer/clerk/producer;
- provider adapter;
- simulcast;
- recording;
- YouTube adapter.

Gate: live/hybrid E2E.

## Phase 12 — Hardening / Migration / Launch
- load;
- security;
- backup restore;
- V1 migration;
- pilot;
- production.

## Developer involvement
Primarily:
- external accounts/secrets;
- infrastructure access;
- V1 export/access;
- production deployment gates.

Routine coding remains Claude's responsibility.
