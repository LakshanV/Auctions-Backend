# PRESERVATION + TARGET DOMAIN ARCHITECTURE

Permanent records must survive future versions:
Customer/Singha ID, Organizations, Operators, Assets, Listings, Offers/Revisions, Bids, Auctions, Procurement Requests, Awards/Sales, Payments, Settlements, Shipments, Documents, Audit, applied rule snapshots.

Recommended bounded contexts:
Identity; Organizations; Operators/Markets; Inventory; Listings/Category Schemas; Sale Methods; Offers; Auctions; Procurement/Wanted; Supply Programmes; Commerce; Currency/FX; Locations; Logistics; Payments; Fees; Tax/Compliance; Documents/Terms; Engagement/Connect; Discovery; AI; Social; Intelligence; Audit; Control Centre.

Evidence rules:
- binding terms immutable;
- proposal counters create revisions;
- private proposals/proxy max/reserve never leak;
- LLM never directly decides or executes binding money/quantity transactions;
- payment proof != payment confirmation;
- external effects via outbox/idempotent adapters;
- provider objects stay outside permanent neutral domain where possible.

Migration rule:
expand → backfill → verify → dual read/write if needed → switch → retire legacy later.
No destructive drop/rename in the introduction phase.
