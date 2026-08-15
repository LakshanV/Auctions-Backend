# LOGISTICS / PORTS / INCOTERMS / PAYMENT / FEES / TAX

## Logistics
First-class neutral entities:
Port, Airport, Inland Depot, Pickup Site, Transport Method, Logistics Provider, Route, Quote, Booking, Shipment, Shipment Event.

Category capabilities configured, not hardcoded:
vehicles pickup/tow/RoRo/container; machinery haulage/flat rack/breakbulk; produce reefer/cold-chain/air/sea; scrap loading/weighing/dismantling/bulk; gems secure/insured courier; general parcel/pallet/LCL/FCL.

Support buyer/seller/Singha-arranged freight, quote-required and instant-estimate.
Quote != booking; persist assumptions, expiry and provider.

Incoterms/trade terms configurable: EXW/FCA/FOB/CFR/CIF/DAP + future codes.
Offer revisions may carry their own trade term.

## Payment orchestration
One UX, operator-specific regulated routes.
Resolve from operator, currency, locations, transaction type and provider eligibility.
Do not create unlicensed internal banking/escrow.

Persist separate components:
principal, buyer premium, seller commission, platform/method fee, freight, taxes, inspection, certification, documentation, storage, export admin, other.

## Fee/tax/rule engines
Versioned configurable rules by operator/jurisdiction/category/seller/buyer/method/value/quantity/service.
Persist applied rule ID/version/basis/amount.
Old transaction must remain reproducible after rules change.

Webhook writes verified/signed where supported and idempotent.
