# TEST MATRIX

Layers per docs/17. Phases 0–1 cover unit/domain, DB integration, migration/
upgrade-safety, and a full permission-enforcing E2E. Concurrency/load and
UI/browser E2E arrive with later phases.

## Current coverage

| Layer                    | Where                       | What is proven                                                                                                                         |
| ------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — contracts         | `packages/contracts`        | ids, event envelope, **RBAC matrix**, **category-schema validation**                                                                   |
| Unit — config            | `packages/config`           | defaults, flag coercion, provider detection, required-env error                                                                        |
| Unit — observability     | `packages/observability`    | secret redaction, metrics, correlation                                                                                                 |
| Unit — domain            | `packages/domain`           | boundaries DAG, Money, Asset≠Listing, audit immutability, outbox map, listing lifecycle, **auction proxy/soft-close engine**           |
| Unit — auctionflow       | `packages/auctionflow`      | view-mode cycling                                                                                                                      |
| Unit — api               | `apps/api`                  | health, feature-flags, **JWT round-trip + actor mapping**                                                                              |
| Unit — worker            | `apps/worker`               | outbox batch dispatch (success + partial failure)                                                                                      |
| Integration — DB         | `database`                  | migrated tables, Asset/Listing identity, **append-only audit**, outbox persistence                                                     |
| Integration — migrations | `database`                  | additive `asset.attributes` nullable, **upgrade-safety (old-shaped row survives)**, trigger intact                                     |
| E2E — data core          | `scripts/e2e-data-core.mjs` | full seller→staff flow: **permission 403s**, category 400, **illegal-transition 409**, atomic outbox + append-only audit               |
| E2E — auction            | `scripts/e2e-auction.mjs`   | **serialized concurrent bids** (exactly-one-accepted burst), proxy, soft-close, winner/reserve, outbid, gapless append-only bid ledger |

## How to run

```bash
pnpm run check      # format + lint + typecheck + build + unit tests
pnpm run test:db    # ephemeral Postgres: migrations + DB/upgrade-safety integration
pnpm run test:e2e   # ephemeral Postgres: build API + full data-core E2E
pnpm run test:auction  # ephemeral Postgres: auction concurrency + soft-close E2E
```

CI runs unit + DB integration against a Postgres service and then the E2E driver.

## Counts (approx.)

47 unit tests · 7 DB integration tests · 1 E2E driver (~16 assertions).

## Gaps / TODO (later phases)

- Concurrency & soft-close (Phase 2), EOI privacy (Phase 3), full transaction
  E2E (Phase 6), omnichannel/social mocks (7/9), live/hybrid E2E (Phase 11),
  full permission matrix, load, and restore drills (Phase 12).
- In-process Nest e2e (supertest) as an alternative to the out-of-process driver.
