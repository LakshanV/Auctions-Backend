# AI / INTELLIGENCE / SECURITY / ANTI-CLONE

## AI
Preserve current prompt-injection guard, context redaction, private prompt registry and model-tier routing.

Extend:
- Listing AI: universal/category extraction
- buyer ↔ listing matching
- supplier ↔ procurement matching
- Offer Intelligence: compare complete proposals
- Logistics Intelligence: routes/methods
- Pricing Intelligence: comparables
- Fraud/Risk: review signals

Deterministic code, not LLM, controls:
money, quantity, FX arithmetic, deadlines, routing, eligibility, tax/fees, confidentiality, bid validity and transaction state.
LLM never directly binds a transaction.

## Crown jewels remain server-side
transaction routing, buyer/supplier matching, offer ranking, pricing/logistics intelligence, fraud rules, auction/proxy logic, Buyer Twin weights, fee/tax rule evaluation, prompts/policies, payment/settlement logic.

## Security
Required:
RBAC + operator scoping, admin MFA/AAL2, KYC protection, offer confidentiality, bidder/proxy/reserve privacy, secure upload design, signed URLs, webhook verification, payment idempotency, rate limiting/abuse detection, dependency/vulnerability scans, secret isolation, secure logs, backup/DR.

For confidential offers:
- no pre-reveal amount/term leakage through API, logs or browser bundle;
- no cross-operator IDOR;
- aggregate counts cannot reveal individuals;
- audit every reveal/approval/selection.

Anti-clone uses private source/server logic/data protections/provenance/rate limits/monitoring/legal controls. No destructive tricks.
