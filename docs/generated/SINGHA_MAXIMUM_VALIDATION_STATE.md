# SINGHA — Maximum-Intensity System Validation: LIVE STATE

> Continuously-updated working state for the maximum-intensity validation & autonomous
> defect-correction programme. The final report is
> `SINGHA_MAXIMUM_SYSTEM_VALIDATION_REPORT.md`. This file is the running log.

_Last updated: 2026-08-18 (run in progress)._

## Environment (this run)

| Item                  | Value                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Backend repo          | `LakshanV/Auctions-Backend` — baseline `ea706a0` (== origin/main)                                                   |
| Frontend repo         | `MUA1234/Auctions-New` — baseline `4954921` (== origin/main)                                                        |
| Working branch (both) | `claude/new-session-at0qp4` (repositioned onto latest main; was strictly behind, 0 unmerged commits)                |
| DB                    | PostgreSQL 16 on `127.0.0.1:5433` (`/tmp/pgdata`)                                                                   |
| Reproduction API      | `apps/api/dist/main.js` on `:4000`, `DEMO_AUTH_ENABLED=true`, all `FEATURE_*` on, DB `singha_val` (fresh, migrated) |
| Isolation DBs         | per-suite fresh DBs (`iso_*`) for exact-count suites                                                                |
| Personas              | synthetic only (`/dev/token` mints seller / auction_staff / customer JWTs). NO real customer data.                  |

## Branch decision

This session's harness mandates development on `claude/new-session-at0qp4`. All prior
project history lives on `main` (deployed line: Railway/Vercel). The pre-existing
`claude/new-session-at0qp4` was strictly behind main with no unmerged commits, so it was
repositioned onto the latest validated main. All defect-correction commits land here;
merging to the deployed `main` is an owner launch-gate action (not performed autonomously).

## Method (per directive)

`discover → reproduce → diagnose root cause → fix → add regression test → rerun → continue`,
real-UI-first then verify authoritative state via API/DB/audit. Fix P0/P1/P2; P3 where low-risk.
No new features. No weakening of the auction engine to make a test pass. No real financial
liability. No destructive production actions.

## Baseline gate status

| Gate                                                                    | Result                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend e2e suites (38) — each against its own fresh DB (CI-equivalent) | **38 / 38 green**                                                                                                                                                                                                                            |
| Note                                                                    | Running all 38 against one shared DB inflates the two exact-count catalogue suites (`catalogue-scale` expected 2000 → saw 2005; `catalogue-v2` 1002). Confirmed a harness/shared-DB artifact — both pass in isolation. NOT a product defect. |

## Adversarial discovery probes (read-only source analysis) — in flight

| #    | Surface                                                                                    | Status  |
| ---- | ------------------------------------------------------------------------------------------ | ------- |
| §111 | IDOR / BOLA / cross-tenant / sealed-offer & bid privacy / award-not-auto-highest           | running |
| §112 | API fuzz / input validation / BigInt-500 / mass-assignment / XSS sinks                     | running |
| §113 | Auction engine concurrency / bid race / append-only ledger / soft-close / winner integrity | running |
| §115 | AI safety — guard coverage / advisory-never-authoritative / rule 11 / provider gating      | running |
| §116 | Transactional atomicity / outbox / idempotency / DB invariants / partial-failure           | running |

Findings are triaged into the Defect ledger below, each reproduced against the live API/DB
before any fix.

## Defect ledger (live)

Cross-validated from 5 read-only source audits (IDOR/privacy, API-fuzz/XSS, auction concurrency,
AI safety, transactional/DB invariants) + 3 live runtime probes (bid concurrency-integrity,
500-hunt fuzz, close/bid race). Fix order: P0 → P2 → low-risk P3.

| ID  | Sev    | Area                                                 | Reproduction                                                                           | Root cause                                                                 | Fix                                                          | Regression                                                  | Status    |
| --- | ------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- | --------- |
| D01 | **P0** | Auction `close()` winner/price integrity             | `close()` concurrent with a final bid → Sale records the stale prior buyer/price       | close() read the auction OUTSIDE the tx, no `FOR UPDATE`, no in-tx re-read | lock + in-tx re-read + idempotent status recheck             | `e2e-auction-stress` scenario R (Sale-agrees-with-head ×12) | **FIXED** |
| D02 | P2     | Double-`close` duplicate events                      | 2 concurrent closes on an unsold auction → 2× `AUCTION_CLOSED` + double credit release | same stale outside read                                                    | same fix (idempotent early-return under the lock)            | `e2e-auction-stress` R (exactly 1 event)                    | **FIXED** |
| D03 | P2     | `GET /intelligence/sellers/:orgId` cross-tenant leak | seller token reads a competitor org's revenue/deal-count                               | gated by `intelligence:read` only, no org-membership check                 | require caller ∈ org (or staff)                              | security e2e                                                | OPEN      |
| D04 | P2     | `GET /assets/:id` anonymous raw asset                | no token → owner id + draft attributes of any asset                                    | no principal, no projection, route undecorated                             | require principal; owner/staff or public projection          | security e2e                                                | OPEN      |
| D05 | P2     | `draftListing` skips `redactContext`                 | forbidden keys in attributes reach the provider (latent behind mock)                   | the one AI path not applying the redaction guard                           | redact attributes before provider call                       | ai-safety unit                                              | OPEN      |
| D06 | P2     | Bid amount 500 (PG BIGINT overflow)                  | `maxAmountMinor=1e40`/`MAX_VALUE` → 500                                                | money schema lacks a safe-int upper bound → value overflows BIGINT column  | bound money to `≤ MAX_SAFE_INTEGER`                          | fuzz + stress H                                             | OPEN      |
| D07 | P2     | `verifyPayment` double-confirm                       | concurrent confirm of one payment → 2× `payment_received` in append-only ledger        | status guard outside tx, in-tx update has no status predicate              | conditional `updateMany` + no-op                             | commerce e2e                                                | OPEN      |
| D08 | P2     | `market-pulse?days=<neg>` → 500                      | anonymous; large negative `days` → Invalid Date → Prisma 500                           | upper-clamped only, no lower bound                                         | clamp both ends / schema                                     | insight e2e                                                 | OPEN      |
| D09 | P2     | Outbox never retries `failed`                        | a throwing publish strands the event forever                                           | `fetchPending` reads `pending` only; `failed` terminal                     | retry `pending`+`failed` w/ attempts cap + dead-letter       | worker test                                                 | OPEN      |
| D10 | P3     | `ai/runs/:id` + feedback ownership                   | seller reads/annotates another actor's run                                             | resolved by id, no actor scope                                             | scope to actor (or staff)                                    | ai e2e                                                      | OPEN      |
| D11 | P3     | Logistics shipment/quote/book scoping                | any participant reads any shipment / books any quote                                   | no owner (`bookedByCustomerId`) scope                                      | scope to owner/staff; bind quote requester                   | logistics e2e                                               | OPEN      |
| D12 | P3     | `createAsset` owner forge                            | seller sets arbitrary `ownerCustomerId`                                                | client value trusted for non-staff                                         | force `principal.customerId` unless `asset:manage`           | security e2e                                                | OPEN      |
| D13 | P3     | `respondOffer` amount divergence                     | accept with `amountMinor`≠original → Offer head ≠ Sale                                 | schema allows amount on non-counter                                        | tighten `respondOfferSchema`                                 | offers e2e                                                  | OPEN      |
| D14 | P3     | `respondOffer`/`buyNow` raw unique 500               | concurrent accept on one listing → raw P2002 500                                       | no in-tx listing `FOR UPDATE`                                              | lock+re-read → clean 409                                     | offers e2e                                                  | OPEN      |
| D15 | P3     | Sealed `openTender()` stale pre-tx read              | late tender bid excluded yet marked opened                                             | bids read before the tx/lock                                               | re-read bids in the UoW under lock                           | exchange e2e                                                | OPEN      |
| D16 | P3     | Procurement `award()` not once-only                  | concurrent award → two accepted proposals                                              | no lock / conditional guard                                                | `FOR UPDATE` / conditional update                            | procurement e2e                                             | OPEN      |
| D17 | P3     | `Invoice.saleId` no FK                               | schema — unenforced referential integrity                                              | bare string                                                                | add relation, `onDelete: Restrict`                           | migration                                                   | OPEN      |
| D18 | P3     | Bid `idempotencyKey` no DB unique                    | schema — dedupe relies on app lock                                                     | no constraint                                                              | partial `@@unique([auctionId, idempotencyKey])`              | migration                                                   | OPEN      |
| D19 | P3     | `allowsFreeText` inert                               | declared policy never enforced by guard                                                | guard ignores the flag                                                     | enforce in `guardAiRequest`                                  | ai-safety unit                                              | OPEN      |
| D20 | P3     | `redactContext` shallow                              | nested Tier-A keys survive redaction                                                   | top-level keys only                                                        | recurse into nested objects/arrays                           | ai-safety unit                                              | OPEN      |
| D21 | P3     | `AiRun`/`AiFeedback` no DB immutability              | app-enforced append-only only                                                          | no DB trigger                                                              | append-only trigger (freeze output; feedback insert-only)    | migration                                                   | OPEN      |
| D22 | P3     | `client-ref.ts` raw-SQL interpolation                | latent (hardcoded callers)                                                             | `nextval('${seq}')` string interp                                          | allowlist / bind                                             | unit                                                        | OPEN      |
| Q1  | design | Legacy `SEALED_TENDER` auto-awards highest           | `tender/open` binds `ranked[0]`                                                        | pre-V2 method predates the no-auto-highest rule                            | decide vs §14 (staff-only; classic sealed-bid is defensible) | —                                                           | DECIDE    |

## Runtime torture performed (live)

| Probe                                                                  | Result                                                                                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bid concurrency-integrity (16 simultaneous bids × 6 randomized rounds) | PASS — final price/winner invariant to arrival order; correct proxy price; stable; post-close 409; 0 × 5xx                   |
| Close/bid race (close ‖ final bid × 30)                                | Caught **D01** (Sale recorded stale buyer/price every round on the buggy build); PASS after fix                              |
| 500-hunt fuzz (37 hostile payloads on bid/auction/offer/list)          | Caught **D06** (2× 500 on BIGINT-overflow amounts); all other inputs clean 4xx                                               |
| Append-only ledger / bid privacy / soft-close / proxy                  | Confirmed SOLID by source audit (single `bid.create`, no bid update/delete; maxima never serialized; server-side soft-close) |

## Open gates (owner / provider / legal)

- Real provider credentials (AI vision/text, payment, messaging) — mock adapters used; real keys are an owner action.
- Merge of validated branch to deployed `main` — owner launch gate.

## Fix loop — COMPLETE

All confirmed defects D01–D22 corrected at root cause, each with a proven regression, across 8
commits on `claude/new-session-at0qp4` (base `ea706a0`):

| Commit    | Defects                         | Area                                                                                        |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `856be9e` | D01 (P0), D02 (P2)              | auction `close()` row-lock + idempotent — winner/price integrity                            |
| `ac4ed70` | D03, D04, D06, D08, D12 (P2/P3) | object-level authz (intelligence, assets) + money bounds + market-pulse clamp + owner-forge |
| `bab1ee0` | D05 (P2), D19, D20 (P3)         | AI data-boundary redaction (uniform + recursive) + structured-only policy                   |
| `813ff7d` | D07 (P2)                        | payment verification idempotent under concurrency                                           |
| `27b2013` | D13, D14, D15, D16 (P3)         | offer-accept amount + offer/tender/procurement row locks                                    |
| `3b9fdbc` | D09 (P2), D22 (P3)              | outbox retry of failed events + raw-SQL sequence allowlist                                  |
| `c9ac95e` | D17, D18, D21 (P3)              | DB invariants: invoice→sale FK, bid idempotency unique, AI append-only triggers             |
| `321261f` | D10, D11 (P3)                   | AI-run + shipment-timeline object-level authz                                               |

**Q1 (design, NOT silently changed):** the legacy `SEALED_TENDER` (`/exchange/listings/:id/tender/open`)
auto-awards the highest bid. The current V2 sealed-OFFER path already enforces explicit award
(no auto-highest, verified). Whether directive §14's "no auto-award" binds the pre-V2 classic
sealed-bid method is a **product-policy decision escalated to the owner** — not changed unilaterally
(it would alter shipped commercial behaviour). D15 fixed only its stale-read race.

### Gates (this run)

- `pnpm run check` (format + lint + typecheck + build + unit): **PASS** — domain 236, api 153, contracts 41, all packages green.
- `contract:check`: **PASS** — public API contract unchanged (all fixes are runtime/DB, contract-stable).
- Full backend e2e (**39/39** suites, each on its own fresh DB, CI-faithful): **PASS**.
- FE static gate (typecheck + lint): **PASS** (FE unchanged this session; contract copy in sync). Full FE `turbo build` blocked locally only by `next/font/google` egress (environmental; builds on Vercel).

Verdict: **CONTROLLED_PILOT_GO_WITH_OWNER_ACTIONS** — see `SINGHA_MAXIMUM_SYSTEM_VALIDATION_REPORT.md`.
