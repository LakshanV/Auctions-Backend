# V3_BASELINE — Backend (`LakshanV/Auctions-Backend`)

Prepared per pack `00_EXECUTE_THIS_FIRST.md`. Reconciled against actual source.

## Current SHA

- `main` at baseline: `1a10340` (in sync with `origin/main`; Railway green per pack doc 01).
- V3-0 closure lands on top.

## Genuinely implemented (verified this session)

- Domain foundations intact: Customer→Asset→Listing separation; timed-auction
  concurrency/proxy/soft-close; append-only Bid ledger; EOI/BuyNow/MakeOffer/Tender;
  commerce/settlement; member/credit/security exposure engine.
- RBAC (`Role.Customer` → bid/eoi/exchange/commerce/watch) + **AAL2 enforcement
  present**: `require-assurance.decorator.ts` + `assurance.guard.ts`, **15
  `@RequireAssurance` routes** across auction/commerce/identity/marketplace.
- Server-controlled feature flags: `GET /api/v1/feature-flags` ←
  `@singha/config` `features` ← `FEATURE_*` env (safe defaults).
- Deploy resilience: `scripts/start.sh` migrate-retry + `:6543` transaction-pooler
  routing (`resolveRuntimeDatasourceUrl`) — fixes the EMAXCONNSESSION deadlock.
- Gates verified locally: `format:check` GREEN (after fixing 3 files this session),
  `typecheck` 13/13, config unit 14/14.

## Fixed this session (was CI-red)

- Prettier failures on `docs/generated/IMPLEMENTATION_STATUS.md`,
  `RAILWAY_REQUIRED_CONFIGURATION.md`, `scripts/migrations-current.mjs` → formatted.

## Added this session

- **11 V3 experience flags** (`v3VisualArchitecture`, `flowMatrixV3`,
  `categoryOverlayV3`, `featuredReelV3`, `discoverV3`, `buyerTwinV3`, `bidBattleV3`,
  `gestureBidV3`, `engagementV3`, `dashboardV3Beta`, `liveV3`) — all default OFF,
  server/config-controlled, surfaced via `/feature-flags`. (`packages/config`)

## Partial / not yet V3

- Catalogue omitted-sort default is not yet `ending` (V3-2 backend task).
- No V3 data-model entities yet: `DiscoveryEvent`, `BuyerTwinProjection`,
  `RecommendationImpression`, `PublicBidderAlias`, `EngagementPreference`,
  `NotificationEvent/Delivery`, `FeaturedPlacement` (pack doc 06).
- No generated OpenAPI contract artifact for the frontend client yet (pack doc 05).
- Provider adapters (Connect/AI/Social/Live/notifications) exist as mock/gated only.

## CI / deploy status

- Railway: green at `1a10340`.
- Normal CI: was red on Prettier (now fixed). Full E2E gate (core/auction/member/
  commerce/security/scale) requires the ephemeral-DB harness — run in CI, not in
  this local baseline. CodeQL/security workflows green per pack doc 01.

## Security / IP blockers (P0, owner)

- Repo still **public** → anti-clone gate `NO_GO` until private.
- Branch protection on `main` unverified by owner.

## Decisions (this session)

- Work on `main`; V3 flags ship OFF for safe rollout/rollback (pack doc 21). Not
  pushed unless asked (repo policy).

## V3-0 status: PASS_WITH_OWNER_ACTION

Local gates green; owner P0s (privacy, branch protection) outstanding.
