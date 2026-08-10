# 17 — TESTING & ACCEPTANCE

## Rule
A screen is not completion.

Critical features must be proven:
UI -> API -> business rules -> DB -> permissions -> events -> audit.

## Test layers
- unit/domain;
- DB integration;
- API integration;
- concurrency;
- provider adapter contract;
- browser E2E;
- permission/security;
- migration;
- load/performance.

## Timed Auction E2E
1. Create seller.
2. Create vehicle asset/listing.
3. Upload 25 images.
4. Upload 2 videos.
5. Upload report/docs.
6. Configure timed auction.
7. Reserve/increment/soft close.
8. Approval/publish.
9. Two verified buyers.
10. Watch.
11. Competing bids.
12. Near-simultaneous bids.
13. Duplicate retry.
14. Proxy max.
15. Soft close.
16. Realtime update.
17. Close.
18. Correct winner.
19. Invoice.
20. Proof/payment confirm.
21. Release.
22. Pickup/delivery.
23. Settlement.
24. Full audit.
25. Dashboard row transitions.

## EOI E2E
1. Create property/machinery listing.
2. Select EOI.
3. Publish.
4. Two buyers submit.
5. Public values remain private.
6. Staff shortlist.
7. Revision/negotiation.
8. Accept one.
9. Convert to sale.
10. Invoice/payment/release.
11. Audit.

## Live/Hybrid E2E
- broadcaster or encoder feed;
- SE.lk live viewer;
- online bids;
- floor bid clerk;
- phone/floor source metadata;
- current-lot synchronization;
- dynamic overlay data;
- auctioneer SOLD/PASS/NEXT;
- YouTube simulcast adapter;
- simulate YouTube failure;
- Singha auction continues;
- recording metadata;
- one unified ledger.

## Omnichannel E2E
Using mocks/sandboxes until credentials:
- inbound WhatsApp-like message;
- identity resolution;
- AI reply;
- human takeover;
- outbound notification;
- bid intent;
- explicit confirmation;
- engine acceptance/rejection receipt.

## Social Publisher E2E
- individual post selection;
- AI creative draft;
- approval;
- adapter publish mock;
- publication record;
- duplicate retry idempotency;
- grouped campaign;
- attribution URL.

## AI integrity
Prove:
- no unsupported factual publication;
- original media unchanged;
- derivative provenance;
- AI cannot alter bid/payment/release;
- tool authorization works.

## Upgrade-safety
- old fixture migrations;
- permanent IDs retained;
- customer/assets retained;
- bid/finance history retained;
- search/read models rebuildable.

## AuctionFlow
- Cube/Grid/List;
- filters persist;
- independent row rotation;
- keyboard;
- reduced motion;
- live bid update preserves position;
- mobile gesture lock.

## Load
Test closing-time surge, many realtime clients, simultaneous bids, notification spikes and catalogue search.

Define measurable launch targets once infrastructure is provisioned and store in generated test matrix.

## Production definition of done
- no P0/P1 acceptance failures;
- no unresolved destructive migration;
- no known critical auth/data exposure;
- reproducible build;
- backups/restore tested;
- monitoring/alerting active.
