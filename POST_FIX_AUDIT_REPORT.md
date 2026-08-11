# Singha Auctions V2 — Post-Fix Audit Report

Autonomous execution of `01_FULL_AUTONOMOUS_FIX_PACKAGE` (after the
`02_TARGETED_STABILISATION_SECURITY_PACK` release gate passed).

**Date:** 2026-08-11 · **Env:** pnpm 9.15.0, node 24.18.0
**Status vocabulary:** `COMPLETE_VERIFIED` · `PARTIAL` · `MOCK_ONLY` ·
`BLOCKED_CREDENTIALS` · `NOT_STARTED`

Repos: backend (canonical) `Auctions-Backend` @ baseline `e30a276`; frontend
`Auctions New` @ baseline `2d00eed`. Backend changes here; frontend changes in
the frontend repo (see its `POST_FIX_AUDIT_REPORT.md` pointer).

## Verification headline

- Backend Gate A (`pnpm check`): format/lint/typecheck 13/13/build/unit — green.
- Backend `pnpm test:acceptance`: **all 12 e2e suites green** (data-core,
  auction, eoi, exchange, commerce, connect, ai, social-intel, live,
  catalogue-v2, events-content, **security 19/19**).
- Frontend: `next build` 10/10; auctionflow+contracts unit tests green; internal
  route/link check green.

## P0 security / privacy / integrity — `COMPLETE_VERIFIED`

Delivered by the stabilisation pack (FIX-01..11); see `STABILISATION_RELEASE_REPORT.md`.

| Finding                                                                            | Fix                                            | Evidence           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------ |
| SEC-001 public detail leaks drafts                                                 | public-status filter in `catalogue-v2.service` | S01/S02            |
| SEC-002 cover/videoAvailable leak private/processing media                         | `publicReady()` visibility+status filter       | S03/S04            |
| SEC-003 media/object IDOR                                                          | `asset-authz.canManageAssetMedia`              | S05/S06/S22 + unit |
| SEC-004 backend MFA/AAL not enforced                                               | `assurance.guard` + `@RequireAssurance`        | S10/S11/S12 + unit |
| SEC-005 insecure prod defaults                                                     | `production-invariants` in `config/env`        | S13/S14/S15        |
| SEC-006 bearer token in stream URL                                                 | authenticated fetch reader (frontend)          | S20                |
| SEC-007 unverified email identity link                                             | hardened JIT provisioning                      | S16–S19            |
| Data integrity: READY without stored object; filename fallback; doc/video finalize | `media.service` + storage verification         | S07/S08/S09/S23    |

## P1 — this package

### Catalogue scale (doc 05) — `COMPLETE_VERIFIED` (core) / `PARTIAL` (scale extras)

- **Per-category Rubik cursor** — `GET /api/v2/catalogue/row` (category + cursor).
  Every category item reachable, not just the first global page; id-tiebreak
  ordering keeps pages cursor-stable. Frontend `CategoryBand` loads each row
  independently and prefetches on `CubeRow.onNearEnd`.
  Evidence: catalogue-v2 e2e (row page1/page2-cursor/full-walk/empty); build 10/10.
- **Sale-aware price sort** — within a sale method, price sorts by that method's
  commercial figure (auction bid / Buy Now price / else guide). Evidence: e2e
  "Buy Now price sort returns only buy_now cards".
- `PARTIAL`: category facet is still aggregated in Node (correct, but not
  DB-side); no 2,000-vehicle seed + reachability load test yet. Remaining risk:
  facet cost at large catalogues. Next: push facet to a SQL group-by / read model
  and add the seeded scale test.

### Realtime (doc 07) — `COMPLETE_VERIFIED` (in-process) / `PARTIAL` (multi-instance)

- **Shared fan-out** — `AuctionRealtimeGateway` (one pub/sub channel per auction).
  SSE endpoint no longer polls `getState` every 2s per viewer; it sends an
  authoritative snapshot on connect + shared post-commit frames, with a slow 20s
  poll only as a resilience fallback. Engine publishes after commit; `getState`
  carries `version` as a monotonic sequence. Evidence: gateway unit 4/4; auction
  e2e "SSE stream pushes live state".
- `PARTIAL`: transport is in-process (correct for the single API instance). A
  multi-instance deploy needs Redis / Postgres LISTEN-NOTIFY behind the same
  service, plus a 1,000+ viewer load/reconnect gate. Not yet run.

### Canonical backend / contracts (doc 08) — `PARTIAL`

- `COMPLETE`: authority declared. Frontend `apps/api`/`apps/worker` frozen
  (`DEPRECATED.md`); README + CLAUDE.md updated; verified the web app imports
  neither and Vercel builds only `@singha/web`.
- `NOT_STARTED`: generated/shared typed client (frontend still declares DTOs
  manually); physical removal of the frozen backend from the pnpm workspace
  (root e2e scripts still reference it); CI breaking-change detection on contracts.
  Remaining risk: silent DTO drift between frontend and canonical backend.

### Dashboard / seller / currency (doc 09) — `PARTIAL`

- `COMPLETE_VERIFIED`: explicit `PLATFORM_CURRENCY` (LKR) config; the dashboard
  strip total is documented single-currency. 9 command-centre bands present
  (Watching, Winning, Outbid, Payment Due, Ready for Pickup, EOI Submitted,
  Offers Active, Tenders Submitted, Past Purchases).
- `NOT_STARTED`: remaining bands (Bidding, Won, Lost, Paid, Delivery Pending,
  EOI Under Review/Shortlisted/Negotiating) — need lifecycle/data modelling.
  **Durable institutional-seller attribution** (org on asset/listing/sale so
  history survives staff changes) — schema migration + provenance backfill;
  deferred as an expand-migrate change, not started.

### Product / routes / status (doc 10) — `COMPLETE_VERIFIED`

- Dead primary-nav links fixed: `/how-it-works` + `/terms` now real, truthful
  pages (frontend). Internal route/link check added to CI. Mock providers remain
  labelled — see below.

### Test / CI / migration gates (doc 11) — `PARTIAL`

- `COMPLETE`: backend security CI (stabilisation pack) + frontend CI refocused on
  the frontend with a dead-link gate. All 12 backend e2e suites + security
  regressions green.
- `NOT_STARTED`: migration-safety integration test (expand→backfill→verify→
  contract proving customer/asset/bid/invoice/payment/audit survive a migration).
  Remaining risk: data-survival not yet asserted by an automated test.

## Credential-gated modules — `MOCK_ONLY` / `BLOCKED_CREDENTIALS`

AI, Connect (WhatsApp/Meta/SMS/email), Social Publisher and Live provider
adapters remain mocks behind adapters (permitted by the pack). They are labelled
in provider status and must not be reported as production-complete until
credentials + integration work exist.

## Post-fix checklist (doc 13) roll-up

Security: all boxes green (P0 pack). Data: green. Catalogue/Auction: green
(reachability, stable rows, sale-aware sort, public-DTO privacy) — DB-side facets
outstanding. Architecture: canonical authority green; generated contracts +
duplicate physical removal outstanding; durable seller org outstanding. Realtime:
shared fan-out present + reconnect snapshot; multi-instance + load gate
outstanding. Product/CI: no dead links, mocks labelled, mandatory CI present;
migration integration test outstanding.

## Not production-ready

Per the pack's definition of done, the following gate a production declaration
and remain open: DB-side facets + seeded scale test; multi-instance realtime +
1k-viewer load gate; generated typed contracts + duplicate removal; durable
institutional-seller attribution; migration-safety integration test; remaining
dashboard bands. These are the tracked follow-ups.
