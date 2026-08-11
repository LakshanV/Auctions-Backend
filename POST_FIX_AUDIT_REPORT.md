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

- Backend Gate A (`pnpm check`): format/lint/typecheck 13/13/build/unit (21) — green.
- Backend `pnpm test:acceptance`: **all 13 e2e suites green** (data-core, auction,
  eoi, exchange, commerce, connect, ai, social-intel, live, catalogue-v2,
  events-content, **security 19/19**, seller-org + migration-safety).
- Backend extra gates: `test:scale` (2,000-lot Rubik reachability) + `contract:check`
  (public API contract) — green.
- Frontend: `next build` green; auctionflow+contracts unit tests green; route/link
  check + contract-conformance check green.

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

### Catalogue scale (doc 05) — `COMPLETE_VERIFIED`

- **Per-category Rubik cursor** — `GET /api/v2/catalogue/row` (category + cursor).
  Every category item reachable, not just the first global page; id-tiebreak
  ordering keeps pages cursor-stable. Frontend `CategoryBand` loads each row
  independently and prefetches on `CubeRow.onNearEnd`.
- **Sale-aware price sort** — within a sale method, price sorts by that method's
  commercial figure (auction bid / Buy Now price / else guide).
- **DB-side facets** — the category facet is now bounded parallel `COUNT`s (one
  per `CATEGORY_KEY`); no full-row transfer to Node.
- **Seeded scale acceptance** — `test:scale` bulk-seeds 2,000 vehicles + mixed
  categories and proves via the real API: all 2,000 reachable through the row
  cursor (no repeats, terminates), DB-side facet = 2,000, global list returns one
  24-row page. Evidence: catalogue-v2 e2e + `pnpm test:scale` green.

### Realtime (doc 07) — `COMPLETE_VERIFIED` (multi-instance code) / infra load gate documented

- **Shared fan-out** — `AuctionRealtimeGateway`: SSE no longer polls `getState`
  per viewer; snapshot on connect + shared post-commit frames + slow 20s
  resilience fallback; `getState` carries `version` as a monotonic sequence.
- **Cross-instance transport** — `RedisRealtimeTransport` behind the gateway
  (ioredis, lazy; single psubscribe delivery path → no double delivery); Redis
  when `REDIS_URL` is set, else in-process; connection failure degrades to
  in-process. Unit tests simulate two instances on a shared bus (publish on A
  reaches a subscriber on B, exactly once). Evidence: gateway unit 6/6; auction
  e2e SSE green.
- Remaining (infra, not code): the 1,000+ concurrent-viewer load/reconnect gate
  must be run against real Redis + multiple instances on staging.

### Canonical backend / contracts (doc 08) — `COMPLETE_VERIFIED`

- Authority declared: frozen `apps/api`/`apps/worker` (`DEPRECATED.md`), README +
  CLAUDE.md updated; web imports neither; Vercel builds only `@singha/web`.
- **Anti-drift contract gate** — `contracts/public-api.contract.json` is generated
  from the backend's live responses (`contract:emit`); backend `contract:check`
  fails CI on drift; the frontend copies the same file and `check-contracts.mjs`
  asserts its DTOs cover it (it caught + fixed real `AuctionState` drift). Both
  gates in CI. (Physical removal of the frozen backend from the workspace remains
  a later cleanup — it is inert and cannot become a second source of truth.)

### Dashboard / seller / currency (doc 09) — `COMPLETE_VERIFIED`

- Explicit `PLATFORM_CURRENCY` (LKR); dashboard strip total documented
  single-currency.
- **All 17 command-centre bands** now derived from the authoritative tables
  (Watching, Bidding, Winning, Outbid, Won, Lost, Payment Due, Paid, Ready for
  Pickup, Delivery Pending, EOI Submitted/Under review/Shortlisted/Negotiating,
  Offers, Tenders, Past Purchases); empty bands dropped.
- **Durable institutional-seller attribution** — additive `seller_organization_id`
  on asset (enduring) + sale (financial record), migration
  `20260811080000_durable_seller_org` with provenance-safe backfill (unambiguous
  single-org owners only). Captured at consignment, copied to Sale at award.
  `test:seller-org` proves attribution survives the consigning employee LEAVING
  the org, and the backfill preserves ids/amounts.

### Product / routes / status (doc 10) — `COMPLETE_VERIFIED`

- Dead primary-nav links fixed (`/how-it-works`, `/terms`, `/live` — Singha Live
  landing). Internal route/link check in CI (catches nav-array + JSX hrefs). Mock
  providers remain labelled — see below.

### Test / CI / migration gates (doc 11) — `COMPLETE_VERIFIED`

- Backend CI: `check` + data-core/auction e2e + security regressions + scale +
  seller-org + contract check. Frontend CI: format/lint/typecheck/tests/build +
  route check + contract conformance.
- **Migration-safety integration test** — `test:seller-org` Part B seeds
  representative "old" (null-attribution) rows, applies the migration backfill,
  and verifies unambiguous attribution, that multi-org owners are left NULL, and
  that pre-existing ids/amounts survive (expand → backfill → verify).

## Credential-gated modules — `MOCK_ONLY` / `BLOCKED_CREDENTIALS`

AI, Connect (WhatsApp/Meta/SMS/email), Social Publisher and Live provider
adapters remain mocks behind adapters (permitted by the pack). They are labelled
in provider status and must not be reported as production-complete until
credentials + integration work exist.

## Post-fix checklist (doc 13) roll-up

Security: green (P0 pack). Data: green. Catalogue/Auction: green — reachability
(2,000-lot scale test), stable rows, sale-aware sort, DB-side facets, public-DTO
privacy. Architecture: canonical authority green; anti-drift contract gate on
both repos; durable seller-org attribution green. Realtime: shared fan-out +
reconnect snapshot + cross-instance Redis transport (1k-viewer load gate is an
infra run). Product/CI: no dead links, mocks labelled, mandatory CI on both
repos, migration-safety test green.

## Definition-of-done status

All Definition-of-Done bullets are met and verified in code:
P0/P1 resolved · typecheck/lint/build/tests green both repos · negative security
tests green · media READY guarded · AAL2/MFA enforced · production refuses
insecure defaults · no bearer token in stream URLs · Rubik reaches all category
items (2,000-lot proof) · frontend contracts guarded against silent drift · CI
mandatory both repos · this report uses the required status vocabulary.

The only residual is operational, not code: the **1,000+ concurrent-viewer
realtime load/reconnect gate** must be executed on staging with real Redis +
multiple instances before a high-value live launch. AI/Connect/Social/Live stay
`MOCK_ONLY`/`BLOCKED_CREDENTIALS` by design.
