# 04 — DATA MODEL & FUTURE-UPGRADE SAFETY

## Primary requirement
Future V3/V4/V5 interfaces and services must be replaceable without corrupting permanent business records.

## Stable IDs
Use opaque UUID/ULID-style IDs for:
customer, organization, asset, listing, sale event, auction, bid, invoice, payment event, settlement, conversation and publication.

Human-readable references are separate.

## Asset vs Listing
`Asset` is the enduring object.
`Listing` is one presentation/sale attempt.

One asset can be:
- auctioned;
- passed in;
- converted to EOI;
- Buy Now;
- re-listed;
without recreating the inventory identity.

## Append-only history
### Bid ledger
Never silently rewrite accepted bids.
Corrections produce explicit correction/reversal events.

### Finance
Store ledger transactions, not only mutable balances.

## Audit
Capture:
- actor;
- action;
- target;
- timestamp;
- correlation;
- reason;
- before/after or event payload.

Normal admins cannot delete audit history.

## Category schema versioning
Vehicle/Gem/Property/etc. schemas carry versions so new fields do not break old assets.

## AI-derived data
Store separately with:
- subject ID/type;
- insight type;
- model/provider/version;
- prompt version;
- source IDs;
- structured output;
- confidence;
- review state;
- timestamps.

## Media provenance
Keep original immutable.
Derived image/video stores `source_media_id` and derivation method/model.

## Migration protocol
1. Expand
2. Backfill
3. Dual compatibility
4. Verify
5. Contract in later release after approval

## API compatibility
Version contracts so old mobile clients can coexist during upgrades.

## Backup rule
Before production migrations:
- restore capability exists;
- staging rehearsal completed;
- integrity queries defined.
