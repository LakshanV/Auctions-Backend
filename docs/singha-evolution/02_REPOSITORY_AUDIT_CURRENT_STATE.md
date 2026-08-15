# CURRENT REPOSITORY AUDIT BASELINE

Observed at pack generation:
- FE `main`: `1172592fb009dafca89000b1265392dea5a88009`
- BE `main`: `f1676fbe1258c164708a4c667d39b8e83b0cb61c`

Claude MUST fetch latest again; these are evidence, not pins.

## Strong reusable foundations
Backend already has:
- generic `Customer`, `Organization`, `Asset`, `Listing`
- `Asset.attributes` JSON + schema versioning
- stable public references
- immutable media provenance
- audit + transactional outbox
- one authoritative auction engine and bid ledger
- `Sale`, invoices/payments/fulfilment/settlement foundations
- Exchange module for Buy Now, Make Offer and Sealed Tender
- credit-capacity protections
- V3 Discover/Buyer Twin, Engagement, AI safety, Social approval, Intelligence, Live

Frontend already has:
- premium V3 shell
- responsive navigation
- animated/self-hosted Singha logo
- Flow catalogue
- category taxonomy
- Discover/dashboard/live surfaces
- responsive screenshot testing

## Current important constraints/gaps
1. `SaleMethod` is still a fixed enum: `TIMED_AUCTION`, `EXPRESSION_OF_INTEREST`, `BUY_NOW`, `MAKE_OFFER`, `SEALED_TENDER`, `LIVE_HYBRID`.
2. Current `Offer` is essentially amount/currency + note; target needs full commercial terms.
3. Current sealed tender flow can rank and auto-award highest; target sealed-offer default must be MANUAL selection unless explicitly configured otherwise.
4. Listing location is still flat city/region, not structured location roles.
5. No first-class Operator domain.
6. No quantity/unit engine.
7. No binding-vs-display currency/FX quote architecture.
8. No RFQ/Request Supply/Reverse Tender/Procurement domain.
9. No recurring Supply Programme.
10. No structured ports/routes/logistics quote architecture.
11. Fees/taxes/routing are not yet fully data-driven/versioned.
12. Singha ID needs currency/language/timezone/company/activity-verification extensions.
13. Public language/navigation remains partly auction-led.
14. Local-site SEO/routing architecture is not yet first-class.

## Preserve, don't rebuild
Keep Asset→Listing separation, auction integrity, immutable evidence, V3 visual system, security and existing provider-adapter philosophy.
