# IMPLEMENTATION STATUS

_Phases 0–2 COMPLETE and verified._ (Phase 0 foundations, Phase 1 data core,
Phase 2 timed auction engine.)

## Phase 0 checklist

- [x] Monorepo, tooling, CI, observability baseline, generated docs
- [x] Domain-boundary scaffold; stable data-core schema; migrations; design system

## Phase 1 checklist (gate: permissions + migration tests)

- [x] Identity/customer — register, read (self/permission), external identities, KYC
- [x] Organizations/sellers — create org (owner member), add members (ownership-authorized)
- [x] Assets — create/update with **versioned category-schema validation**
- [x] Listings — create + guarded lifecycle (submit → review → publish)
- [x] Category schemas — vehicles/machinery/gems/property/bulk/general (v1)
- [x] Media/docs — register immutable original + derivative provenance
- [x] Audit — every consequential command writes an append-only audit entry
- [x] Outbox — domain events written **atomically** with state (unit of work)
- [x] **Server-side RBAC** — JWT principal + permissions guard + ownership checks
- [x] **Migration tests** — additive `asset.attributes`, upgrade-safety, trigger intact
- [x] E2E — full seller→staff flow proving permission 403s + outbox/audit

## Phase 2 checklist (gate: concurrency + soft-close E2E)

- [x] Auction config — configure/open/close from a listing (staff)
- [x] **Append-only bid ledger** — DB trigger rejects UPDATE/DELETE
- [x] Increments + reserve (+ visibility) + opening bid
- [x] **Proxy / max bidding** — private maxima; deterministic visible price
- [x] **Concurrency** — row-locked bids (`SELECT…FOR UPDATE`) serialize
- [x] **Soft close** — bids in the trigger window extend the end time
- [x] Realtime projection — privacy-safe poll endpoint (SSE/WS adapter later)
- [x] Close + winner — reserve-met sale vs passed-in, events emitted
- [x] E2E — concurrency (exactly-one-accepted burst), proxy, soft-close, winner

## API surface (all under `/api/v1`)

| Command               | Route                                     | AuthZ                          |
| --------------------- | ----------------------------------------- | ------------------------------ |
| registerCustomer      | `POST /customers`                         | public                         |
| getCustomer           | `GET /customers/:id`                      | self or `customer:read`        |
| linkExternalIdentity  | `POST /customers/:id/external-identities` | self or `customer:manage`      |
| setKyc                | `POST /customers/:id/kyc`                 | `kyc:manage`                   |
| createOrganization    | `POST /organizations`                     | `organization:create`          |
| addOrganizationMember | `POST /organizations/:id/members`         | owner or `organization:manage` |
| createAsset           | `POST /assets`                            | `asset:create`                 |
| updateAssetAttributes | `PATCH /assets/:id/attributes`            | owner or `asset:manage`        |
| createListing         | `POST /listings`                          | `listing:create`               |
| submitListing         | `POST /listings/:id/submit`               | `listing:submit`               |
| reviewListing         | `POST /listings/:id/review`               | `listing:review`               |
| publishListing        | `POST /listings/:id/publish`              | `listing:publish`              |
| registerMedia         | `POST /assets/:id/media`                  | `media:manage`                 |
| addDerivative         | `POST /media/:id/derivatives`             | `media:manage`                 |
| configureAuction      | `POST /auctions`                          | `auction:configure`            |
| openAuction           | `POST /auctions/:id/open`                 | `auction:operate`              |
| placeBid              | `POST /auctions/:id/bids`                 | `bid:place`                    |
| closeAuction          | `POST /auctions/:id/close`                | `auction:operate`              |
| auctionState          | `GET /auctions/:id/state`                 | public (privacy-safe)          |
| devToken (non-prod)   | `POST /dev/token`                         | dev only                       |

## Not started (later phases)

EOI/Exchange (3), public site + AuctionFlow Cube (4),
seller/admin UI (5), commerce/settlement (6), Singha Connect (7), AI Core (8),
Social Publisher (9), Asset Intelligence (10), Singha Live (11), hardening +
V1 migration + launch (12).

## Gate status

Phases 1 and 2 gates **passed** via `pnpm run check` (format, lint, typecheck,
build, unit), `pnpm run test:db` (migrations and integration), `pnpm run test:e2e`
(data-core permissions + outbox/audit) and `pnpm run test:auction` (concurrency,
proxy, soft-close, winner). Ready for Phase 3 (EOI + Exchange).
