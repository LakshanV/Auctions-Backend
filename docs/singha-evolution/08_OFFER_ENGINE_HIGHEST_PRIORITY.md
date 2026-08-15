# COMMERCIAL OFFER ENGINE V2 — HIGHEST PRIORITY

Offers are a first-class domain, not an auction accessory.

Reuse current Exchange/UoW/audit/Sale/credit patterns, but evolve proposal data.

Support:
MAKE_OFFER, NEGOTIATED_SALE, PRIVATE_OFFER, SEALED_OFFER, FLASH_OFFER, BEST_OFFER.

An immutable OfferRevision may contain:
- total and/or unit price
- currency
- quantity/unit
- Incoterm
- origin/destination
- delivery date/window
- payment terms
- freight responsibility/shipping requirement
- validity
- notes/doc refs/structured conditions.

Counter = new revision + append-only event + current-revision pointer.
Never overwrite prior proposal terms.

Confidentiality:
- no competitor prices/terms pre-reveal;
- public counts may show participation/offer count only;
- enforce seller/operator/auditor permissions;
- cross-operator access denied.

Seller comparison must compare the whole commercial proposal, not only nominal price.

Binding acceptance:
- lock listing/proposal rows;
- verify not already awarded;
- revalidate routing/method eligibility/KYC;
- snapshot selected revision and applied rules;
- reserve obligation/capacity;
- create one Sale/Award atomically;
- emit audit/outbox.

## Sealed Offer
Default award policy = `MANUAL_SELECTION`.

After controlled reveal authorized seller/admin can:
Accept, Counter, Reject, Extend, Negotiate, Change Method, Send to Auction.

Optional `AUTO_HIGHEST` exists only if explicitly configured before launch and allowed by operator/rules. Never silently inherit current auto-award behavior.
