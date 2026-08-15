# OPERATOR / LOCATION / TRANSACTION ROUTING / TERMS

## Operator
Operator is a configurable software/legal routing concept and may represent a company, subsidiary, sister company, agent, custodian, representative or local service entity. Do not equate Operator with current Organization automatically.

Fields/config should include stable code, legal/public names, entity type, active dates, jurisdiction/market links, disclosures, payment/settlement routes and capabilities.

## First-class locations
Separate:
asset location; seller location; custodian location; pickup; export origin; origin port; destination; destination port.

Reusable Location should support country, region/state, city/locality, private address where permitted, coordinates optional and visibility.

## Transaction Routing Engine
Input:
asset/seller/buyer/custodian locations, listing operator, destination, sale method, category, currency, logistics, KYC/licence status and configured rules.

Output:
transaction operator, payment route, terms/version, eligible method, fee/tax/compliance versions, disclosure, required verification, logistics options, or `MANUAL_REVIEW_REQUIRED`.

Routing must be deterministic/explainable and versioned.
Avoid direct country `if/else` forests.

## Terms
Two layers:
1. Platform Terms
2. Transaction Terms

Transaction terms resolve from operator/jurisdiction/category/method/shipping/payment configuration.
Legal wording remains owner/legal-reviewed content. Claude must not invent law.
