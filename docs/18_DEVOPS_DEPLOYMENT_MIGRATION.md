# 18 — DEVOPS, DEPLOYMENT & V1 MIGRATION

## Environments
- Local
- CI
- Test
- Staging
- Production

Never use production as a testing environment.

## CI
On change:
- format;
- lint;
- typecheck;
- unit;
- integration;
- build;
- migration validation.

On release:
- E2E;
- security/dependency scan;
- staging deploy;
- production gate.

## Infrastructure as code
Prefer reproducible infrastructure for:
- compute;
- DB;
- Redis;
- storage/CDN;
- jobs/queues;
- secrets;
- monitoring.

## Observability
Track:
- structured logs/correlation;
- errors;
- queue failures;
- DB health;
- bid acceptance latency;
- realtime clients;
- stream health;
- provider integration failures;
- AI latency/cost;
- social/message publish failures.

## Feature flags
Examples:
- LIVE_AUCTIONS
- EOI
- BUY_NOW
- SEALED_TENDER
- SOCIAL_AUTO_PUBLISH
- AI_LISTING
- AI_MEDIA_ENHANCE
- CUBE_CATALOGUE
- WHATSAPP_BID_INTENT

Deploy disabled -> internal test -> cohort -> general release.

## Backups
- automated DB;
- PITR;
- storage versioning/retention where appropriate;
- restore drills.

## V1 to V2 migration
V1 remains live while V2 is built.

Stages:
1. inventory V1 data;
2. map to V2 canonical IDs;
3. build migration scripts;
4. dry-run;
5. reconciliation;
6. staging migration;
7. product sample validation;
8. delta/cutover plan;
9. production cutover;
10. verify;
11. optionally retain V1 read-only archive.

Never modify V1 source during a dry-run.

## Reconciliation
Compare:
- customers;
- assets/listings;
- media;
- auction history;
- invoices/payments if migrated;
- external identities.

Generate exception report; never silently discard invalid rows.

## Rollback
Document:
- trigger;
- application rollback;
- DB compatibility window;
- queue drain;
- prevention of duplicate outbound messages/social posts.
