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
pnpm run test:member   # ephemeral Postgres: Client ID, credit exposure, security,
                       # 5% rule, temporary grant, performance, flag privacy E2E
```

## Revision 05 — member / credit / security / performance

| Requirement (Rev 05 §27)                                       | Where                           |
| -------------------------------------------------------------- | ------------------------------- |
| Client ID unique under concurrent registration                 | `test:member` (6-way burst)     |
| Client ID stable; one Customer for Buyer+Seller                | `test:member`                   |
| Pending security = 0 eligible; verified contributes            | `test:member`                   |
| Expired guarantee stops new supported credit                   | `test:member`                   |
| Unauthorized staff cannot verify; private docs                 | `test:member`                   |
| Configurable 5% rule (500k→10m; 10%→5m)                        | `test:member` + domain units    |
| Manual cap; available = approved − committed                   | `test:member`                   |
| Concurrent bids cannot over-reserve capacity                   | `test:member` (race)            |
| Outbid releases / won converts / paid releases                 | `test:member` + `test:commerce` |
| AAL2 required on credit approval (MFA_REQUIRED)                | `test:member`                   |
| Temporary onsite grant + scope/expiry                          | `test:member`                   |
| Performance deterministic / rebuildable / INSUFFICIENT_HISTORY | `test:member` + 11 domain units |
| Flags/score private; resolve preserves history                 | `test:member`                   |

## Cockpit / Dashboard context + currency (E11b)

| Invariant proved                                                                      | Where                                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Unauthorized organization context is rejected (403; non-member, wrong org, anonymous) | `dashboard.service.spec.ts` + `test:dashboard`                               |
| Organization existence is not leaked to a non-member (403, not 404)                   | `dashboard.service.spec.ts` + `test:dashboard`                               |
| Staff `organization:manage` is admitted and marked `viaStaffPermission`               | `dashboard.service.spec.ts`                                                  |
| `organizationId` in a personal request is refused (400, schema AND service)           | `dashboard-domains.test.ts` + `dashboard.service.spec.ts` + `test:dashboard` |
| Organization-consigned assets/sales never appear in the personal cockpit              | `dashboard.service.spec.ts`                                                  |
| Personal buy-side / supply / KYC rows never appear in the organization cockpit        | `dashboard.service.spec.ts` + `test:dashboard`                               |
| Unlike currencies stay in separate buckets and are never summed                       | `currency-totals.test.ts` + `dashboard.service.spec.ts`                      |
| No monetary aggregate exposes a cross-currency scalar total                           | `dashboard.test.ts` + `dashboard.service.spec.ts` + `test:dashboard`         |
| A row with no valid ISO currency, or unsafe minor units, is refused (422)             | `currency-totals.test.ts`                                                    |

## Organization-attributed procurement requests

| Invariant proved                                                                         | Where                                                             |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Creating for an organization the caller does not belong to is refused (403)              | `procurement.service.spec.ts` + `test:procurement`                |
| Membership of a DIFFERENT organization is not accepted as authorization                  | `procurement.service.spec.ts`                                     |
| Organization existence is not leaked on creation (403 non-member, 404 only for staff)    | `procurement.service.spec.ts` + `test:procurement`                |
| `organizationId` in a personal creation/read is refused (400, schema AND service)        | `actor-context.test.ts` + both service specs + both E2E drivers   |
| A member's creation is stamped with a durable `buyer_organization_id`                    | `procurement.service.spec.ts` + `test:procurement` (DB assertion) |
| A personal creation stays unattributed; the default context can never attribute          | `procurement.service.spec.ts` + `test:procurement`                |
| The personal list excludes organization-attributed requests                              | `procurement.service.spec.ts` + `test:procurement`                |
| The organization list excludes personal requests and includes a colleague's              | `procurement.service.spec.ts` + `test:procurement`                |
| One organization's list never contains another organization's requests                   | `procurement.service.spec.ts` + `test:procurement`                |
| Reading another organization's book is refused (403)                                     | `procurement.service.spec.ts` + `test:procurement`                |
| A colleague may manage the organization's request; a rival organization's member may not | `procurement.service.spec.ts` + `test:procurement`                |
| The original poster loses management once they are no longer a member                    | `procurement.service.spec.ts`                                     |
| A personal request is unreachable from any organization membership                       | `procurement.service.spec.ts` + `test:procurement`                |
| The organization Cockpit shows the organization's procurement book only                  | `dashboard.service.spec.ts` + `test:dashboard`                    |
| The personal Cockpit excludes organization-attributed requests                           | `dashboard.service.spec.ts` + `test:dashboard`                    |

CI runs unit + DB integration against a Postgres service and then the E2E driver.

## Counts (approx.)

47 unit tests · 7 DB integration tests · 1 E2E driver (~16 assertions).

## Gaps / TODO (later phases)

- Concurrency & soft-close (Phase 2), EOI privacy (Phase 3), full transaction
  E2E (Phase 6), omnichannel/social mocks (7/9), live/hybrid E2E (Phase 11),
  full permission matrix, load, and restore drills (Phase 12).
- In-process Nest e2e (supertest) as an alternative to the out-of-process driver.
