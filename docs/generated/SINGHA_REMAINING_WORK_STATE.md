# SINGHA — Remaining Work State (RW0 persistent memory)

Per-item current state, evidence, and the smallest additive completion path. This is the
project memory: consult it instead of re-auditing. Paths are absolute; canonical backend =
`/home/user/Auctions-Backend`, frontend = `/home/user/Auctions-New`.

---

## RW1 — Synthetic-customer browser pilot — PARTIAL

Harness exists at `/home/user/Auctions-New/apps/web/pilot` (config/personas/fixtures/run + lib +
journeys 00-anon, 20-ai-security, 30-commerce, 40-auction, 50-abuse-privacy). Every RW1 invariant
is already proven by 33 backend e2e scripts (`/home/user/Auctions-Backend/scripts/e2e-*.mjs`,
`pnpm test:acceptance`) + domain tests. Remaining = author customer-layer journeys:

- Journey C (RFQ): GAP → `POST /procurement/requests|/:id/proposals|/:id/close|/:id/award` (exemplar `scripts/e2e-procurement.mjs`).
- Journey D (supply): GAP → `POST /supply/programmes|/perishable|/recommend|/:id/status` (`scripts/e2e-supply.mjs`).
- Journey E (logistics): GAP → `POST /logistics/quotes|/:id/book`, `POST /logistics/shipments/:id/events` PICKED_UP→IN_TRANSIT→ARRIVED→DELIVERED + illegal-skip 409 (`scripts/e2e-logistics.mjs`).
- Journey F (local reflection): GAP → `GET /nodes/:code|/discovery`, `POST /nodes/:code/originate` (operator) + verify same canonical id on `/catalogue` (`scripts/e2e-node.mjs`).
- Journey A tail: counter → immutable revision → accept binds exactly one Sale (`scripts/e2e-offers.mjs` Part 1/2).
- Journey B tail: reveal → award a NON-highest offer → losers update (`scripts/e2e-offers.mjs` Part 3, D4).
- Journey G: consolidate abuse matrix (webhook replay, idempotency dup, malformed 422, rate-limit 429).

One true backend gap feeding G: **no media size/MIME ceiling** (see RW3).

## RW2 — AI Vision seller intake — MISSING (greenfield on scaffolding)

Reusable seams: `apps/api/src/modules/ai/ai.provider.ts` (`AiProvider`/`AI_PROVIDER` DI + `MockAiProvider`),
`apps/api/src/modules/ai/ai.service.ts` + `AiRun` model (derived record + run-level provenance +
explicit human-apply), `apps/api/src/modules/intelligence/intelligence.service.ts` (`comparables`) +
`packages/domain/src/modules/insight/insight.ts` (`priceComparables`) + `IntelligenceReport` snapshot,
FE `apps/web/src/app/sell/new/page.tsx` wizard + `apps/web/src/lib/api.ts` (`requestAiListingDraft`).

Smallest additive vertical (provider-agnostic, non-binding, per-field provenance):

1. `ai.provider.ts` — add `VisionIntelligenceProvider` port (`analyzeMedia(images, categoryHint)` → per-field `{value,confidence,source}` + recommendedPhotos + comparablesQuery) + `MockVisionProvider` deterministic fake; new `VISION_PROVIDER` symbol; bind in `ai.module.ts`.
2. New `vision` intake service+controller (or extend `ai`): `POST /ai/vision/intake` → runs guard → provider → persists an `AiRun` (taskType `media_caption` already in enum) → returns a per-field draft with provenance; NEVER writes asset facts (human confirms per field).
3. Capture-coach: per-category required-photo checklists (domain constant) + missing-view detection surfaced in the draft.
4. Valuation orchestration: reuse `IntelligenceService.comparables` filtered by extracted make/model/year → low/expected/high + confidence + comparable refs + snapshot (advisory only).
5. FE: `sell/new` capture step that calls the intake and renders per-field accept/edit/reject.
   Also fix the live contract mismatch: FE `requestAiListingDraft` posts `{category,attributes,notes}` but backend `draftListingSchema` expects `{assetId,locale}`.

## RW3 — Secure media (documents, video) — PARTIAL

Photo signed pipeline COMPLETE + hardened (`apps/api/src/modules/media/media.service.ts`
`createUploadUrl`/`registerMedia`, FIX-04 foreign-key reject, FIX-05 existence verify, immutable
original, single-cover, audit). Docs/video ride the same signed pipeline, private-by-default, but:

- **No authorized download endpoint** — `getSignedDownloadUrl` (`shared/storage/*.provider.ts`) has zero callers.
- No MIME/type allowlist, no size cap (schema accepts `contentType`/`sizeBytes`, service ignores).
- No scanner hook interface; no video poster; `processing`/`failed` states unused; no media tests.

Smallest additive (files): `packages/contracts/src/commands.ts` (per-kind MIME allowlist + max-size on
`createUploadUrlSchema`/`registerMediaSchema`; download-grant schema), `media.service.ts` (enforce
contentType/kind+size; validate mimeType; add `getMediaDownloadUrl` with object authz; optional scanner
port call), `media.controller.ts` (`GET media/:mediaId/download-url`), `shared/storage/storage.provider.ts`
(optional `MediaScanner` port), new `media.service.spec.ts`.

## RW4 — Catalogue projections + server filters — PARTIAL

`apps/api/src/modules/catalogue/catalogue-v2.service.ts` `buildWhere`/`toCardV2` +
`catalogueQuerySchema` (`packages/contracts/src/commands.ts:543`). Present: category/search/saleMethod/
location/endingSoon/featured/status + facets + sale-aware commercial + offset+cursor pagination.
2000-lot scale test EXISTS (`scripts/e2e-catalogue-scale.mjs`, `SCALE_N=2000`).
Missing (columns already exist: `quantityAvailable`, `quantityUnitCode`, `pickupLocationId`,
`destinationLocationId`): filters `minPriceMinor`/`maxPriceMinor`, quantity min/max, `unit`,
`pickupAvailable`, `deliveryAvailable`, `verified`; and card hints (quantity, unit, pickup/collection,
delivery, verification indicator). Files: `commands.ts` (extend both catalogue schemas),
`catalogue-v2.service.ts` (`buildWhere` predicates + `toCardV2` hints), contract copy sync in FE.

## RW5 — Sealed-offer seller RBAC — PARTIAL (capability MISSING)

Reveal/award (`apps/api/src/modules/offers/offers.controller.ts`) gated only on broad
`Permission.ExchangeOperate`; `SELLER_PERMISSIONS` lacks it; `offers.service.ts` `viewerRole()` maps a
seller to `'buyer'` (`canRevealSealedOffers('buyer')`=false). Domain ALREADY supports a `'seller'`
viewer (`packages/domain/src/modules/exchange/offer-revision.ts:111`) but the API never builds it. No
server-side listing-ownership check on any offers path. Pre-reveal confidentiality CONFIRMED counts-only.

Smallest additive: add `ExchangeOperateOwn:'exchange:operate-own'` into `SELLER_PERMISSIONS`
(`packages/contracts/src/rbac.ts` + `rbac.test.ts`); allow reveal/award (and forListing) under it in the
controller; extend `viewerRole()` to return `'seller'` for a non-operator who is owner/member of the
listing's seller org, and assert ownership in `revealSealed`/`awardSealed`/`offersForListing`, reusing
`sellerOrgForListing` (`shared/persistence/seller-org.ts`) + the `organizationMember.findFirst({role in
['owner','admin']})` pattern from `apps/api/src/modules/seller/seller.service.ts:52`. No domain change.

## RW6 — Singha Live advanced ops — PARTIAL

Engine remains bid authority (CONFIRMED, rule 12) and `LiveStreamProvider`+`MockLiveStreamProvider`
COMPLETE. Ordered-catalogue scaffolding present (`AuctionEventLot.sequence` unique). Missing: distinct
console roles (all gated on single `live:operate`), lot state-machine (no status field/enum), current-lot
pointer (no `currentLotId` on `AuctionEvent`), sequencing ops. Files: `rbac.ts` (scope `live:operate` or
add roles), `live.controller.ts` (per-endpoint scopes), `database/prisma/schema.prisma` (additive
`AuctionEventLotStatus` enum + `status` on `AuctionEventLot` + `currentLotId` on `AuctionEvent` + migration),
`events.service.ts`/`live.service.ts` (advance/open/close/skip/passIn/withdraw/markSold).

## RW7 — Homepage / customer CX residual — PARTIAL (mostly reuse + copy)

Premium identity/hero/Flow COMPLETE. Attention panel ALREADY EXISTS
(`apps/web/src/components/evolution/ExchangeActivity.tsx` `buildAttentionItems`/`AttentionSection`,
backed by `/api/v2/me/dashboard` + `/api/v1/dashboard` + capabilities) — only homepage placement missing.
Near-you rail + services strip absent (data paths exist). Benefit-led trust-copy candidates (exact strings):
`apps/web/src/app/page.tsx:19,51,55,56,155`, `layout.tsx:28`, `components/home/HomeWaysToTransact.tsx:65`,
`components/Footer.tsx:34` (keep technical wording on legal/security/technical pages: `error.tsx`,
`services/*`, `login` binding language, `lot/[id]` badge is borderline).
Files: new `components/home/HomeAttentionPanel.tsx` (reuse `buildAttentionItems`, hidden signed-out/empty),
`HomeNearYou.tsx`, `HomeServices.tsx`, edit `app/page.tsx`.

## RW8 — Sri Lanka local-market pilot readiness — COMPLETE (pilot-ready)

Public `/n/[code]` (`components/evolution/NodeLocalSite.tsx`), operator `/control-centre/nodes`, backend
`node` module (`GET /nodes/:code|/discovery`, `POST /nodes/:code/originate`), seeded `lk-colombo` /
"Singha Colombo" LK/LKR (`database/prisma/seed-evolution.ts:213`). Central-only ledger via
`NodeOrigination` attribution snapshot. Customer terminology natural ("Local market"); "Satellite/Node"
only in operator-MFA surfaces. Adding a market = MarketNode row + `satelliteNodes` flag. Optional polish:
render node-currency prices on storefront cards; "browse all local" link.

## RW9 — Provider adapters — PARTIAL

COMPLETE ports (Symbol token + fake): FX (`fx/fx.provider.ts`), logistics, messaging
(`connect/channel.provider.ts`) + notification, AI-text (`ai/ai.provider.ts`), video
(`live/live.provider.ts`), storage, social. Payments PARTIAL (provider is a DB column + pure
`resolvePaymentRoute`; HMAC idempotent webhook; no injectable fake pair). MISSING ports: **AI vision**
(→ RW2), **AI voice/telephony** (only a callback intent today), **inspection/certification** (plain text
field). Single conversation brain CONFIRMED. Add the AI-vision port first (subsumed by RW2); voice +
inspection ports are the next two (PROVIDER_GATED for real activation).

## RW10 — Anti-clone / IP — PARTIAL (code-side COMPLETE)

Public DTOs verified leak-free (catalogue card, auction `/state` + SSE, assistant item-context); Tier-A
server-only; presentation packages carry no domain/backend deps; `ai-safety.ts` absent from web bundle;
source maps off; no committed secrets; dev endpoint prod-gated; strict CSP/headers; non-verbose error
filter. One code follow-up: **remove frozen FE `apps/api`+`apps/worker`** — SAFELY REMOVABLE (nothing
deployed/built/CI depends on them; `@singha/web` never imports them). Requires retargeting root
`package.json` `test:e2e`/`test:auction` + `scripts/e2e-auction.mjs`/`scripts/e2e-data-core.mjs` (they
spawn `apps/api/dist/main.js` as a local E2E backend). All other RW10 items are OWNER_ONLY.

## RW11 — Regression/security/scale — INFRA COMPLETE, run-blocked

CI covers it (full E2E + S01–S23 + scale + contract + CodeQL + gitleaks + bundle-secret-scan). Blocked by
the GitHub Actions billing lock → verify locally (`pnpm check`, `pnpm test:acceptance`, `pnpm test:scale`,
`pnpm test:security`; FE `pnpm check` + Playwright + the pilot harness at 360/390/430/768/1024/1440/1920).
