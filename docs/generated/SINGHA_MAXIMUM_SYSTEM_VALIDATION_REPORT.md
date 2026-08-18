# SINGHA — Maximum-Intensity System Validation & Autonomous Defect-Correction Report

_Programme: BREAK SINGHA in every safe way; discover → reproduce → diagnose → fix → regress →
rerun until the material-defect surface is corrected and the validation matrix is green._

## 1. Environment & scope

| Item                 | Value                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend              | `LakshanV/Auctions-Backend` — base `ea706a045a13e9203e5875956967057576a81fec` (== origin/main)                                                                                   |
| Frontend             | `MUA1234/Auctions-New` — base `4954921` (== origin/main), unchanged this run                                                                                                     |
| Fix branch (both)    | `claude/new-session-at0qp4` (repositioned onto latest main; was 0 unmerged commits behind)                                                                                       |
| Runtime              | Node 22, PostgreSQL 16 (`127.0.0.1:5433`), API `apps/api/dist/main.js` on `:4000`, all `FEATURE_*` on, `DEMO_AUTH_ENABLED=true`                                                  |
| Identities           | **synthetic only** — `/dev/token` mints seller / auction_staff / customer JWTs; `[SIM]` customers. No real customer data touched.                                                |
| Constraints honoured | no new features; auction engine never weakened to pass a test; no real financial liability; no destructive production action; no real provider credentials used (mock adapters). |

## 2. Method & personas

Two complementary lenses drove discovery:

1. **Five parallel adversarial source audits** (strongest model), each a hostile persona over a
   distinct high-risk surface: IDOR/BOLA/cross-tenant/sealed-privacy; API-fuzz/validation/XSS;
   auction concurrency/ledger-integrity; AI safety/advisory-boundary; transactional
   atomicity/outbox/DB-invariants.
2. **Live runtime torture** against the running API/DB as malicious / concurrent / invalid-client
   / slow personas: a 16-way concurrent bid burst × 6 randomized rounds; a `close()`‖final-bid
   race × 30; a 37-case 500-hunt fuzz over money/pagination/id endpoints; concurrent
   double-confirm and double-close; anonymous and cross-tenant object-access probes.

Findings were cross-validated (the P0 was found independently by two audits), then every fix was
reproduced against the live system before and after — including reverting the P0 fix to **prove**
the regression fails on the buggy build.

## 3. What was exercised

- **Auction engine stress:** proxy resolution, reserve met/not-met, equal maxima, soft-close
  extension, 5/10/25 + 16-way concurrency, invalid-bid taxonomy, stale-client repricing,
  idempotent resubmission, bid privacy, and the new close/bid-race + double-close-idempotency
  scenario. Final authoritative price/winner proven invariant to arrival order.
- **Concurrency & financial integrity:** bid placement (row-locked, append-only ledger verified —
  single `bid.create`, zero mutations), auction close, payment verification, offer accept, sealed
  tender open, procurement award — all now serialize under row locks; ledgers proven append-only
  at the DB.
- **AuthZ / privacy:** object-level ownership on assets, seller-intelligence, AI runs, shipment
  timelines; sealed-offer/tender pre-reveal counts-only and no-auto-highest (V2) confirmed; bid
  proxy maxima / reserve / bidder identity never serialized.
- **API robustness:** money bounded to a safe integer (no BIGINT-overflow 500), market-pulse date
  clamped, mass-assignment / owner-forge closed, validation-schema coverage confirmed, FE XSS
  sinks confirmed absent.
- **Provider chaos / partial failure:** transactional-outbox atomicity confirmed; failed events
  now retried (were terminal); idempotency keys / unique constraints backstop retries.
- **Migrations:** applied cleanly from empty with **zero drift**; append-only triggers +
  referential FKs added additively.

## 3a. Gate results (this run)

| Gate                                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend `pnpm run check` (format + lint + typecheck + build + unit)      | **PASS** — 13/13 tasks; domain 236, api 153, contracts 41, config 37, others green                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Backend `contract:check` (public API vs live)                            | **PASS** — contract unchanged (all fixes runtime/DB)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Backend E2E — **39 / 39 suites**, each on its own fresh DB (CI-faithful) | **PASS**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Frontend `typecheck` (`@singha/web` + `@singha/auctionflow`) + `lint`    | **PASS** (0 errors)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Frontend full `turbo build`                                              | Blocked **locally only** by network egress — `next/font/google` (Inter/Manrope/Poppins in `app/layout.tsx`) cannot fetch Google Fonts through the sandbox proxy (HTTP 400). Environmental, **not a code defect**: the FE is unchanged this run and builds/deploys on Vercel (which has egress). The frozen pre-split `@singha/database` copy in the FE repo also fails to build (missing `ConfigVerification` enum on the base commit) — a pre-existing issue in DEPRECATED code, out of scope (CLAUDE.md: never touch the frozen copy), not part of the shipping product. |

## 4. Defect ledger

Severity: P0 = money/ledger corruption or data loss; P2 = crash / security / material correctness;
P3 = low-risk hardening / defense-in-depth. All reproduced on the live system.

| ID  | Sev    | Area                                      | Root cause                                                                                                                                                           | Fix                                                                                    | Regression                                                     | Status           |
| --- | ------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------- |
| D01 | **P0** | auction `close()` winner/price            | winner/hammer/Sale computed from a stale **pre-transaction** read (no `FOR UPDATE`, no in-tx re-read); a concurrent final bid → Sale records the wrong buyer & price | lock + in-tx re-read + idempotent status recheck                                       | `e2e-auction-stress` R (proven to fail pre-fix, pass post-fix) | ✅ FIXED         |
| D02 | P2     | double-`close`                            | same stale outside read → 2 concurrent closes on an unsold auction emit 2× `AUCTION_CLOSED` + double credit release                                                  | same lock; second close no-ops idempotently                                            | `e2e-auction-stress` R (exactly 1 event)                       | ✅ FIXED         |
| D03 | P2     | `GET /intelligence/sellers/:orgId`        | gated by `intelligence:read` (every seller) with no org check → any seller reads a rival's revenue/deal-count                                                        | require owner/admin membership of the org, or staff                                    | `e2e-security` (non-member → 403)                              | ✅ FIXED         |
| D04 | P2     | `GET /assets/:id`                         | undecorated + unprojected → **anonymous** callers get the raw asset (owner id, draft attributes)                                                                     | require principal; owner/staff only                                                    | `e2e-security` (anon/other → 403; owner/staff → 200)           | ✅ FIXED         |
| D05 | P2     | AI `draftListing`                         | the one provider call that skipped `redactContext` → Tier-A keys could reach the model                                                                               | redact attributes before the provider call                                             | `ai-safety` unit + e2e-ai                                      | ✅ FIXED         |
| D06 | P2     | money 500 (BIGINT overflow)               | money fields `.int()` but unbounded → a value > MAX_SAFE_INTEGER overflows the BIGINT column → unhandled 500                                                         | bound all `*Minor`/`*Price` to ≤ MAX_SAFE_INTEGER                                      | 500-hunt fuzz + `e2e-auction-stress` H                         | ✅ FIXED         |
| D07 | P2     | `verifyPayment` double-confirm            | status guard outside the tx; in-tx update unconditional → concurrent confirm double-writes the append-only ledger                                                    | conditional `updateMany` claim; loser 409                                              | `e2e-commerce` (1×201 + 1×4xx, one `payment_received`)         | ✅ FIXED         |
| D08 | P2     | `market-pulse?days=<neg>`                 | upper-clamp only → out-of-range Date → Prisma 500 (public, anonymous)                                                                                                | clamp `days` to [1, 365]                                                               | `e2e-security`                                                 | ✅ FIXED         |
| D09 | P2     | outbox dispatcher                         | only `pending` swept; `failed` terminal → a failed event lost forever (latent behind the no-op publisher)                                                            | retry `pending`+`failed` under an attempts cap (dead-letter on exhaustion)             | worker path                                                    | ✅ FIXED         |
| D10 | P3     | AI runs ownership                         | `getRun`/`recordFeedback` id-addressable, `ai:use` only → cross-actor read / evaluation pollution                                                                    | scope to the run's creator or staff                                                    | `e2e-ai` (non-owner → 403)                                     | ✅ FIXED         |
| D11 | P3     | shipment timeline                         | `getShipment` unscoped → any participant reads any delivery timeline                                                                                                 | scope to the booking's customer or staff                                               | `e2e-logistics`                                                | ✅ FIXED         |
| D12 | P3     | `createAsset` owner-forge                 | client `ownerCustomerId` trusted for non-staff                                                                                                                       | ignore unless `asset:manage`                                                           | `e2e-security`                                                 | ✅ FIXED         |
| D13 | P3     | offer accept amount                       | `amountMinor` accepted on accept but Sale bound to the original → Offer head ≠ Sale                                                                                  | schema: `amountMinor` only for a counter                                               | `e2e-exchange`                                                 | ✅ FIXED         |
| D14 | P3     | offer accept lock                         | check-then-create Sale with no listing lock → raw P2002 500 on concurrent accept                                                                                     | `SELECT … FOR UPDATE` listing → clean 409                                              | e2e-exchange/offers green                                      | ✅ FIXED         |
| D15 | P3     | sealed `openTender`                       | winner selected from a pre-tx read → a bid landing during open excluded yet marked opened                                                                            | re-read bids in-tx under a listing lock                                                | e2e-exchange green                                             | ✅ FIXED         |
| D16 | P3     | procurement `award`                       | select + transition assert outside the tx → two concurrent awards accept different proposals                                                                         | lock + re-read request in-tx; explicit selection preserved                             | e2e-procurement green                                          | ✅ FIXED         |
| D17 | P3     | `invoice.sale_id`                         | bare string, no FK → could dangle / mis-link                                                                                                                         | UNIQUE + FK to `sale(id)` ON DELETE RESTRICT                                           | migration + e2e-commerce                                       | ✅ FIXED         |
| D18 | P3     | bid idempotency                           | dedupe relied only on the app lock                                                                                                                                   | partial `@@unique(auction_id, idempotency_key)` (NULLs distinct)                       | `e2e-auction-stress` J                                         | ✅ FIXED         |
| D19 | P3     | `allowsFreeText`                          | declared policy never enforced                                                                                                                                       | enforce in `guardAiRequest`                                                            | `ai-safety` unit                                               | ✅ FIXED         |
| D20 | P3     | `redactContext` shallow                   | top-level keys only → nested Tier-A survived                                                                                                                         | recurse into objects/arrays                                                            | `ai-safety` unit                                               | ✅ FIXED         |
| D21 | P3     | AI append-only                            | `ai_run.output` / `ai_feedback` mutable at the DB                                                                                                                    | triggers: output frozen, feedback insert-only                                          | `e2e-ai` (UPDATE/DELETE rejected)                              | ✅ FIXED         |
| D22 | P3     | raw-SQL `nextval`                         | sequence name interpolated (literal callers only)                                                                                                                    | allowlist the sequence names                                                           | build                                                          | ✅ FIXED         |
| Q1  | design | legacy `SEALED_TENDER` auto-award-highest | pre-V2 classic sealed-bid method predates §14's no-auto-award                                                                                                        | **escalated to owner** (V2 sealed-offer already explicit-award); race hardened via D15 | —                                                              | ⚠ OWNER DECISION |

Areas probed and confirmed **already sound** (no change): bid-placement race / min-increment /
stale-price (row-locked), append-only bid ledger, bid privacy (proxy maxima never serialized),
soft-close (server-authoritative, extend-only), rule 11 (free text → non-binding `BidIntent` only,
confirmed via the authoritative engine), rule 3 (AI never authoritative; `applyDraft` the only
sanctioned write), provider gating (deterministic mocks, no egress), UnitOfWork outbox/audit
atomicity, payment-webhook idempotency, media-registration idempotency, Buy-Now / V2
sealed-offer / procurement award double-sale protection, FE content-safety (no `dangerouslySetInnerHTML`
/ raw-HTML / `javascript:` sinks), security headers / CORS allowlist / route rate-limiting /
error-leak hygiene.

## 5. Final readiness matrix

| Area                     | Unit | API/E2E          | DB                    | Browser/Static                                                          | Security                      | Stress/Concurrency                     | Result                                               |
| ------------------------ | ---- | ---------------- | --------------------- | ----------------------------------------------------------------------- | ----------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Auction engine           | ✅   | ✅               | ✅ append-only + FK   | n/a                                                                     | ✅ privacy                    | ✅ P0 race closed, 16-way + close-race | **GREEN**                                            |
| Commerce / payments      | ✅   | ✅               | ✅ ledger append-only | n/a                                                                     | ✅                            | ✅ double-confirm idempotent           | **GREEN**                                            |
| Offers / sealed / tender | ✅   | ✅               | ✅                    | n/a                                                                     | ✅ pre-reveal counts-only     | ✅ locks added                         | **GREEN** (Q1 owner decision)                        |
| Procurement / supply     | ✅   | ✅               | ✅                    | n/a                                                                     | ✅ owner-gated                | ✅ award once-only                     | **GREEN**                                            |
| AuthZ / privacy (IDOR)   | ✅   | ✅               | n/a                   | n/a                                                                     | ✅ BOLA suite                 | n/a                                    | **GREEN**                                            |
| AI core / safety         | ✅   | ✅               | ✅ append-only        | n/a                                                                     | ✅ injection + boundary       | n/a                                    | **GREEN**                                            |
| Logistics                | ✅   | ✅               | ✅                    | n/a                                                                     | ✅ scoped                     | n/a                                    | **GREEN**                                            |
| API robustness / fuzz    | ✅   | ✅               | n/a                   | ✅ FE static                                                            | ✅ 0×500 on 37 hostile inputs | n/a                                    | **GREEN**                                            |
| Outbox / providers       | ✅   | ✅               | ✅                    | n/a                                                                     | n/a                           | ✅ retry + idempotency                 | **GREEN**                                            |
| Frontend (`@singha/web`) | ✅   | contract-in-sync | n/a                   | ✅ typecheck + lint (build blocked locally by Google-Fonts egress only) | ✅ no XSS sinks               | n/a                                    | **GREEN** (unchanged; code sound, deploys on Vercel) |

## 6. Remaining known issues / open gates

- **Q1 — legacy sealed-tender auto-award (owner decision).** Confirm whether directive §14's
  "no auto-award" binds the pre-V2 classic `SEALED_TENDER` method; if yes, route it through an
  explicit-award step like the V2 sealed-offer engine. Not changed autonomously (shipped commercial
  behaviour / product policy).
- **Real provider credentials (owner/provider gate).** AI vision/text, payment, and messaging run
  on deterministic mock adapters. Wiring real keys is an owner action and re-validation gate; note
  the redaction boundary (D05/D20) is what makes the real-AI swap safe.
- **Deploy / merge to `main` (owner launch gate).** All fixes live on
  `claude/new-session-at0qp4`; merging to the deployed line (Railway/Vercel) is the owner's launch
  gate — not performed autonomously.
- **Backoff / distinct dead-letter state for the outbox (post-pilot polish).** D09 restores
  retry + a cap now; a `nextAttemptAt` column for exponential backoff and a named `dead_letter`
  state are a follow-up migration.

## 7. Verdict

**CONTROLLED_PILOT_GO_WITH_OWNER_ACTIONS.**

Every safely-testable critical and material defect (1×P0, 8×P2) is corrected at root cause with a
proven regression; all low-risk P3 hardenings are done; the static gate, contract check, full
backend e2e matrix, and FE static gate are green. The system is sound for a **controlled pilot**.
Unrestricted public-production GO is withheld pending the owner/provider/legal gates in §6 — the
Q1 sealed-tender policy decision, real provider credentials, and the merge/deploy launch gate — per
the programme's rule that these are owner decisions, not autonomous ones.
