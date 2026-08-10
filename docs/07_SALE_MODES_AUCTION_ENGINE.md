# 07 — SALE MODES & AUCTION ENGINE

## Sale methods
- TIMED_AUCTION
- EXPRESSION_OF_INTEREST
- BUY_NOW
- MAKE_OFFER
- SEALED_TENDER
- LIVE_HYBRID

Future:
- SEQUENTIAL_TIMED
- GROUP_TIMED
- COMMODITY

## Timed auction
Server-authoritative configuration:
- starts_at;
- ends_at;
- opening bid;
- reserve;
- reserve visibility;
- increment rule;
- soft close;
- proxy/max bid;
- deposit/eligibility rule;
- buyer premium;
- payment/collection rules.

## Bid processing
Every bid:
1. authenticates bidder;
2. has idempotency/request ID;
3. checks authoritative auction state/time;
4. checks eligibility/deposit/credit;
5. checks increment;
6. uses safe DB transaction/locking;
7. receives server timestamp;
8. appends immutable bid event;
9. emits domain event;
10. updates read/realtime projection.

Never trust browser/network arrival order.

## Proxy/max bidding
Bidder maximum is private.
Visible bid is calculated by deterministic rules.
Never expose competitor max in API, UI or analytics.

## Soft close
Configurable profiles. Initial safe defaults may be:
- general: final 10s -> reset/extend 20s;
- vehicle: final 15s -> 20s;
- gem: final 15s -> 20–30s;
- property: final 1–2m -> 1–3m.

These are configuration, not hardcoded law.

## EOI
Private structured submission:
- amount optional/required;
- message;
- conditions;
- docs;
- timing/expiry if applicable.

States:
Submitted -> Under Review -> Shortlisted -> Negotiating -> Accepted/Declined/Withdrawn/Expired.

Never expose competing EOI values.

## Buy Now
Atomic reservation/purchase. A unique asset cannot sell twice.

## Make Offer
Append offer/counter/accept/reject/withdraw/expire history.

## Sealed Tender
- private submissions;
- controlled close/review;
- immutable receipt;
- no competitor values;
- strict permissions.

## Live/Hybrid
Bid sources:
ONLINE, FLOOR, PHONE, ABSENTEE, PROXY, AUCTIONEER/CLERK.

All accepted bids enter one ledger.

## Messaging-channel bidding
Free text creates a `BidIntent`, not a bid.

Flow:
message -> parse customer/lot/amount -> show confirmation/fees -> explicit confirmation -> signed/idempotent intent -> normal auction-engine validation -> accepted/rejected receipt.

In final high-speed period, direct SE.lk/Singha Live or a previously confirmed proxy maximum may be required.

## Meet Reserve
Prefer post-auction workflow:
passed-in -> highest eligible bidder -> time-limited meet-reserve offer -> accept/decline/expire.
