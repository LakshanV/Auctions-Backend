# DATA MIGRATION STATUS

## Schema migrations (V2 forward)

Migrations live in `database/prisma/migrations` and follow an additive,
expand-migrate-verify-contract discipline (docs/04).

| Migration           | Contents                                                                                           | State                               |
| ------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `init`              | Identity, inventory, media (+ provenance), audit, outbox, platform config tables + enums + indexes | Generated & applied in verification |
| `audit_append_only` | Trigger rejecting UPDATE/DELETE on `audit_event`                                                   | Generated & applied in verification |
| `asset_attributes`  | Additive nullable `asset.attributes` (JSON) for versioned category attributes                      | Generated & applied in verification |
| `auction_engine`    | Auction/Bid/BidderMax tables + enums (integer minor units; private proxy maxima)                   | Generated & applied in verification |
| `bid_append_only`   | Trigger rejecting UPDATE/DELETE on the `bid` ledger                                                | Generated & applied in verification |

Regenerate/apply locally:

```bash
pnpm db:migrate        # create/apply dev migration from schema changes
pnpm db:migrate:deploy # apply committed migrations
pnpm test:db           # ephemeral DB: apply migrations + run integration tests
```

## V1 → V2 data migration

Not started. V1 remains live and is a **read-only reference/migration source**
(docs/18). Planned stages: inventory V1 data → map to V2 canonical ULIDs → build
scripts → dry-run (never mutate V1) → reconciliation → staging → sample
validation → delta/cutover → verify → optional V1 read-only archive.

## Upgrade-safety guarantees already in place

- Opaque ULID primary keys on all permanent records.
- Asset (enduring) vs Listing (sale attempt) separation.
- Append-only audit (DB-enforced) and outbox event log.
- Category `schema_version` column so old assets never break on new fields.
- Search/read models are rebuildable and never authoritative.

## Backups

Production backup/PITR/restore drills are a Phase 12 concern; not configured.
