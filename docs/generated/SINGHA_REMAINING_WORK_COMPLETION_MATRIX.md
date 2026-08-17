# SINGHA — Remaining Work Completion Matrix (RW0)

Reconciliation audit of latest `origin/main` in both canonical repos, plus the unmerged
`claude/new-session-at0qp4` deltas. Classification legend: **COMPLETE** · **PARTIAL** ·
**MISSING** · **OWNER_ONLY** · **PROVIDER_GATED** · **LEGAL_GATED** · **POST_PILOT**.

Ground truth at audit time:

- Backend `Auctions-Backend` `origin/main` = `b81898b`; working branch `claude/new-session-at0qp4` = `5fce016` (+1 unmerged: catalogue ZodQuery 400 + AI-search "land" fix).
- Frontend `Auctions-New` `origin/main` = `bb02a06`; working branch = `ee0d44f` (+2 unmerged: synthetic pilot harness + Control-Centre KYC enum fix).
- Prior programme fully merged: E0–E15, V3-1…10, CX Overhaul, AI Conversation (AIC-1…7).

## Delivered this continuation (additive, on `claude/new-session-at0qp4`)

- **RW0** — this audit + the four state docs. Backend `6ab628c`.
- **RW5** — sealed-offer seller RBAC (`exchange:operate-own` + server-side ownership; owning seller
  manages their own offers, cross-seller IDOR refused). Unit-tested (10) + live-verified via the
  pilot commerce journey. Backend `1e0947b`, FE pilot `32000ed`. **RW5 → COMPLETE.**
- **RW4** — additive catalogue facets (price/quantity/unit/pickup/delivery) + customer-safe card
  hints; contract facet tests (8) + live-verified; FE types synced. Backend `48a6ba6`, FE `84e96c2`.
  **RW4 → COMPLETE** (except a per-listing `verified` filter, deferred — needs a verification source).
- **RW2** — photo-first AI seller intake (`POST /ai/vision/intake`): provider-neutral
  `VisionIntelligenceProvider` port + deterministic `MockVisionProvider` (PROVIDER_GATED for a real
  OSS/managed engine — see `SINGHA_OSS_DECISIONS.md`); pure domain kernel (category capture coach,
  honest per-field states, seller-claim reconciliation, evidence-based valuation from comparables);
  advisory-only result with full per-field provenance (value/confidence/source/state) recorded as a
  derived `AiRun` (`media_caption`) that mutates NO asset/listing fact; same AI boundary guard on the
  free-text notes; `ai:use` gated. 13 domain unit tests + a 20-assertion live-verified e2e
  (`test:vision`, wired into CI). **RW2 → COMPLETE (engine mock; real model PROVIDER_GATED PRV-1).**

- **RW3** — secure media pipeline: per-kind **MIME allowlist + size caps** enforced at both the
  upload-grant and registration steps (before any storage call), a provider-neutral **MalwareScanner**
  port + deterministic mock screening documents/video before they are marked ready (infected → 422 +
  audited `MEDIA_SCAN_REJECTED`; ClamAV isolated-daemon in prod, PROVIDER_GATED), and an **authorized,
  time-limited download URL** (`GET /media/:id/download-url`) that object-level authorizes the caller —
  private-media IDOR closed (owner passes, other seller 403, anon 401). 8 domain unit tests + an
  11-assertion live-verified e2e (`test:media`, wired into CI). **RW3 → COMPLETE (scanner mock; real
  engine PROVIDER_GATED PRV-1).**

- **RW9** — provider adapter readiness: the three missing ports are now present and
  provider-neutral — **AI vision** (RW2 `VisionIntelligenceProvider`), **voice/telephony**
  (`VoiceProvider` in Connect, future-voice seam), and **inspection/certification**
  (`InspectionProvider`, GSI/lab seam). Each has a deterministic credential-free mock, is bound
  behind a symbol token (swap the binding, nothing else changes), and is unit-tested; real
  activation is PROVIDER_GATED (PRV-2/PRV-3). FX/logistics/messaging/AI-text/video/storage/social
  were already COMPLETE. **RW9 → COMPLETE (mocks; real providers PROVIDER_GATED).**

The rows below are the RW0 snapshot; RW2/RW3/RW4/RW5/RW9 are now COMPLETE per the above.

## Phase-level matrix

| Phase | Item                                                | Class                            | Remaining engineering (smallest additive)                                                                                                                                                         |
| ----- | --------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RW1   | Synthetic-customer browser pilot                    | **PARTIAL**                      | Author journeys C/D/E/F + A/B binding tails + consolidate G. All invariants already proven by 33 backend e2e scripts; endpoints exist.                                                            |
| RW2   | AI Vision seller intake + capture coach + valuation | **MISSING**                      | Greenfield vertical on existing `AiProvider`/`AiRun`/comparables scaffolding. Provider-agnostic, non-binding, per-field provenance.                                                               |
| RW3   | Secure media pipeline (documents, video)            | **PARTIAL**                      | Authorized download endpoint (dead `getSignedDownloadUrl`), MIME/type allowlist + size caps, scanner port. Photo path already hardened.                                                           |
| RW4   | Explore/catalogue projections + server filters      | **PARTIAL**                      | Add price/quantity/unit/pickup/delivery/verified filters + card hints. Columns already exist. Scale test already exists.                                                                          |
| RW5   | Sealed-offer seller RBAC                            | **PARTIAL**                      | Ownership-scoped `'seller'` viewer + narrow `exchange:operate-own` permission + server-side listing-ownership checks. Domain already supports `'seller'`.                                         |
| RW6   | Singha Live advanced ops                            | **PARTIAL**                      | Console roles (auctioneer/clerk/producer/admin) + lot state-machine + current-lot pointer + sequencing ops. Engine authority + video adapter already correct.                                     |
| RW7   | Homepage / customer CX residual                     | **PARTIAL**                      | Place existing attention panel; add Near-you + services rails; benefit-led trust copy. Mostly reuse + copy, not a build.                                                                          |
| RW8   | Sri Lanka local-market pilot readiness              | **COMPLETE**                     | Node surface + seeded `lk-colombo`/"Singha Colombo" + central-only ledger + natural terminology + config-driven markets. Optional storefront-price polish only.                                   |
| RW9   | Provider adapter readiness                          | **PARTIAL**                      | Add AI-vision port (→ RW2), AI-voice/telephony port, inspection/certification port. FX/logistics/messaging/AI-text/video/storage/social COMPLETE; payments provider-agnostic (no port/fake pair). |
| RW10  | Anti-clone / IP hardening                           | **PARTIAL (code-side COMPLETE)** | One code follow-up: physically remove frozen FE `apps/api`+`apps/worker` (safely removable). Rest is OWNER_ONLY.                                                                                  |
| RW11  | Full regression / security / scale                  | **INFRA COMPLETE / RUN-BLOCKED** | CI already runs full E2E + S01–S23 + scale + contract + CodeQL/gitleaks. **Blocked: GitHub Actions billing lock** → verify locally.                                                               |
| RW12  | Final controlled-pilot handoff                      | **PENDING**                      | Produce `SINGHA_REMAINING_WORK_FINAL_REPORT.md` after the additive build.                                                                                                                         |

## Cross-cutting infrastructure (already COMPLETE)

| Area                                                                                                   | Class                  | Evidence                                                                            |
| ------------------------------------------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------- |
| Server-authoritative bidding, row locking, idempotency, append-only ledger                             | COMPLETE               | `auction.service.placeBid` (FOR UPDATE), `bid` append-only, e2e-auction concurrency |
| Proxy-max + sealed confidentiality                                                                     | COMPLETE               | separate `bidder_max`; sealed counts-only pre-reveal; DTOs verified leak-free       |
| RBAC / MFA / signed media / audit / feature flags                                                      | COMPLETE               | `rbac.ts`, `RequireAssurance`, signed upload (FIX-04/05), append-only `AuditEvent`  |
| Provider-agnostic architecture (single conversation brain)                                             | COMPLETE               | Symbol-token ports; assistant reuses Connect+AI bindings (one brain)                |
| CI: full E2E matrix + S01–S23 + scale + contract + CodeQL + gitleaks + bundle-secret-scan + Dependabot | COMPLETE (run-blocked) | `.github/workflows/{ci,codeql,security}.yml` both repos                             |
| Central-ledger invariant across local markets                                                          | COMPLETE               | `NodeOrigination` attribution-only; e2e-node                                        |
| Source exposure (maps off, no secrets, strict CSP, prod-gated dev endpoint, non-verbose errors)        | COMPLETE               | `next.config.mjs` maps off; `domain-exception.filter`; `dev.controller` prod-gate   |

## Owner / provider / legal gates (not engineering-closable)

| Ref   | Item                                                                                                                                             | Class          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| SEC-1 | Make both repos private                                                                                                                          | OWNER_ONLY     |
| SEC-2 | Branch protection + required checks on `main`                                                                                                    | OWNER_ONLY     |
| SEC-3 | GitHub Advanced Security (secret scanning + push protection, Dependabot alerts, CodeQL)                                                          | OWNER_ONLY     |
| SEC-4 | Clear GitHub Actions billing lock (`BLOCKED_EXTERNAL_ACCOUNT`) so CI/CodeQL/gitleaks run                                                         | OWNER_ONLY     |
| PRV-1 | Real AI vision model credentials                                                                                                                 | PROVIDER_GATED |
| PRV-2 | Real payments / FX / logistics / WhatsApp / voice / video / inspection credentials                                                               | PROVIDER_GATED |
| PRV-3 | GSI / gem-lab certification integration                                                                                                          | PROVIDER_GATED |
| O1–O8 | Operator entity/terms, auction licensing, tax/VAT/GST, regulated payments, live FX, logistics/ports master data, KYC/licence, public rollout/DNS | LEGAL_GATED    |

See `SINGHA_REMAINING_WORK_STATE.md` (per-item evidence + file ownership),
`SINGHA_REMAINING_WORK_OPEN_ITEMS.md` (exact owner actions), and
`SINGHA_REMAINING_WORK_DECISIONS.md` (build sequencing + rationale).
