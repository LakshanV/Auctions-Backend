# TESTING / SELF-REVIEW / FEATURE FLAGS

## Test layers
domain unit; service; contracts; migration; API; real-Postgres E2E; concurrency; security; component; browser; responsive screenshots; scale/load where appropriate.

Mandatory offer tests:
confidentiality; revisions/counters; expiry/withdrawal; concurrent acceptance; already-awarded race; manual sealed selection; no default auto-highest; different quantities/incoterms/delivery/payment; cross-operator denial.

Auction regression:
all existing concurrency/proxy/soft-close/reserve/idempotency suites remain green.

Quantity:
decimals, min/max, partial, lot-only, unit vs lot price, invalid conversions.

FX:
rounding, stale rate, display-vs-contractual, provider outage, no double conversion.

Routing:
configuration-driven combinations including SL→SL, SL→AU, IN→SL, AU→IN and future routes.

Logistics:
pickup/domestic/international/port/quote expiry/provider failure.

Rules:
old transaction reproducible after rule update.

Security:
operator isolation, sealed leak, KYC/docs, reserve/proxy, signed URLs, forged webhook, IDOR.

## Self-review after EVERY phase
1 diff review
2 architecture
3 security/privacy
4 format/lint/typecheck/build
5 focused + phase E2E
6 migration/backfill verification
7 contract drift
8 accessibility/responsive if UI
9 query/performance
10 secrets scan
11 rollback
12 identify defects
13 correct defects
14 rerun
15 evidence report

## Suggested new flags
MULTI_OPERATOR, STRUCTURED_LOCATIONS, QUANTITY_UNITS, MULTI_CURRENCY, FX_DISPLAY, COMMERCIAL_OFFERS_V2, SEALED_OFFERS, COMMODITY_TRADING, LOGISTICS, LOGISTICS_QUOTES, TRANSACTION_ROUTING, RFQ, REQUEST_SUPPLY, REVERSE_TENDER, SUPPLY_PROGRAMMES, INTERNATIONAL_CHECKOUT, OPERATOR_PAYMENTS.

Keep existing V3 flags until integration is complete.

Large migrations:
expand → seed → backfill → dual-read compare → dual-write if needed → shadow mode → staging → controlled pilot → monitor → retire legacy later.
