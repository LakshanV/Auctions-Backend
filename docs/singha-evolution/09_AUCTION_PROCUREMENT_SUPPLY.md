# AUCTION / PROCUREMENT / WANTED / SUPPLY

## Auction
Preserve authoritative bid ledger, row locking, proxy privacy, soft close, reserve, winner determination, idempotency and live/floor reconciliation.
Auction becomes one SaleMethod adapter behind neutral Listing.

Before enabling auction resolve operator/method eligibility, verification, terms, fees/premiums and jurisdiction restrictions.

Allow controlled method transitions (offer/EOI → auction) while preserving all old evidence.

## Two-sided market
Support:
**I HAVE SOMETHING TO SELL**
and
**I NEED SOMETHING TO BUY**

## Procurement
Generic request includes buyer/org, product/spec, quantity/unit, destination, delivery schedule, quality/docs, currency/pricing basis, payment terms, submission window and operator/routing.

Support:
- RFQ
- Request Supply
- procurement events
- reverse tender where structured terms are comparable.

Supplier proposals use the same commercial-proposal principles where possible.

## Supply Programme
Recurring availability fields:
product/spec, origin, available qty, frequency, min/max order, pricing basis, packing, quality, shipping/trade terms, validity and lead time.

Generate listings/offers from programmes without duplicating permanent source data unnecessarily.

Matching can recommend counterparties but never auto-award.
