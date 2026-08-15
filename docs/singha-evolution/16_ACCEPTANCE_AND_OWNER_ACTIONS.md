# ACCEPTANCE CRITERIA + OWNER/LEGAL ACTIONS

## Product acceptance
- browse multiple locations without a "Global" silo;
- display currency does not alter contractual currency;
- new category does not require core redesign;
- new operator primarily configuration-driven;
- auction is one method, not required for all commerce.

## Offer acceptance
- complete proposal stored immutably;
- counters create revisions;
- sealed values do not leak;
- highest sealed proposal not auto-awarded by default;
- seller can compare full terms;
- acceptance atomic/idempotent and produces one Award/Sale;
- history remains intact.

## Routing acceptance
- deterministic explainable output;
- applied rule versions persisted;
- no valid route => manual review;
- no hard-coded country forest.

## UX acceptance
Universal cards/item pages work for vehicle, onions/produce, scrap, gem, machinery and property.
Customer-facing language is Singha/Singha Exchange with Auction only when precise.
Mobile/desktop premium V3 quality preserved.

## Owner/legal register
Claude creates config hooks but does not invent:
legal entity names, auction/licensing eligibility, procurement rules, KYC/licence requirements, tax/VAT/GST conclusions, payment/escrow authority, transaction legal wording, privacy, export/import restrictions, food/commodity certificate requirements.

Until confirmed, mark config DRAFT/UNVERIFIED and block binding methods requiring it; allow staging browse and return `MANUAL_REVIEW_REQUIRED`.

Owner/infra:
secrets/credentials, regulated payment providers, FX/logistics provider credentials, DNS/hosting, repository/CI controls, final Hostinger move, final public launch approval.
