# SINGHA — Final Product Intent Completion Report

Progress report for the **Final Product Intent Correction** directive. Honest status: this is a
large, multi-phase programme; the items below are **delivered and verified** this session, and the
remainder is listed with its real state (never marked COMPLETE where a customer can't use it). The
authoritative gap list is `SINGHA_FINAL_PRODUCT_INTENT_GAP_AUDIT.md`.

Method reminder: browser-primary acceptance where a UI exists; API/DB checks corroborate.

## Delivered + verified this session

| #   | Item (directive §)                         | What shipped                                                                                                                                                                                                                                         | Verification                                                                                                 | Commits                    |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------- |
| 0   | CI health (§35)                            | `main` CI was red since RW2 merged — a strict `noUncheckedIndexedAccess` typecheck error in `vision.test.ts` + an unformatted workflow. Fixed.                                                                                                       | Full `check` (format+lint+typecheck+build+test) green locally                                                | BE `a46ff79`               |
| 1   | Gap audit (§1)                             | `SINGHA_FINAL_PRODUCT_INTENT_GAP_AUDIT.md` — 5-way parallel investigation, §41 correction matrix, build sequence                                                                                                                                     | —                                                                                                            | BE `5cc065c`               |
| 2   | Category field-schema endpoint (§2/§3)     | `GET /platform/category-schemas` (ungated) serves per-category field descriptors; Zod schemas enriched additively (optional fields, no version bump); drift-guard test                                                                               | contracts test 6/6; live API returns 6 categories incl. `bulk` with enriched fields                          | BE `5f1ede0`               |
| 3   | Config-driven Listing Studio (§2/§3/§5/§6) | Seller wizard consumes category-schemas + sale-methods + currencies (offline fallback); dynamic typed fields (text/number/select/boolean, required, help, units); transaction-currency selector w/ per-currency minor units                          | **Browser-verified**: `bulk` now selectable, dynamic specs render from live API, 10-currency selector        | FE `551859c`               |
| 4   | Lot gallery (§17)                          | Prev/next arrows + counter, mobile swipe, keyboard nav, zoom/fullscreen lightbox, inline video (graceful)                                                                                                                                            | **Browser-verified** on a 4-image lot (arrows, 4 thumbs, "1/4", lightbox opens)                              | FE `04c9e9b`               |
| 5   | AI listing-draft contract (§11)            | Endpoint now accepts the seller's in-progress facts (`category`/`attributes`/`notes`) as well as `assetId` — every real call was a 400; FE silent `catch` replaced with logged telemetry; notes run through the injection guard; FE↔BE contract test | **Live-verified**: inline payload → **201** + `{title,description,highlights,confidence}`; contract spec 5/5 | BE `549d6aa`, FE `c9409a8` |
| 6   | Homepage trust copy (§23)                  | Trust block, hero footer and Timed-Auction blurb rewritten to customer-benefit language (kept technical language for admin/legal)                                                                                                                    | **Browser-verified** headings render                                                                         | FE `6edf4f0`               |
| —   | Demo covers (interim)                      | 54 owner-supplied PNG covers wired into the demo catalogue; ext-aware seeder; `workflow_dispatch` reseed button                                                                                                                                      | Browser-verified earlier                                                                                     | BE `c129990`, FE `7ec1d3f` |

## Delivered + verified — continuation session

Customer-path features closed since the table above, each browser-verified through the real UI with
the authoritative API/DB corroborated. Non-negotiables honoured throughout (rule 2 UI-never-truth,
rule 3 AI/derived-never-overwrites, rule 12 engine-authoritative).

| #   | Item (directive §)                    | What shipped                                                                                                                                                                                                                                                | Verification                                                                                                                                | Commits                    |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 7   | §15 document/video upload UI          | Documents + video now travel the SAME signed direct-to-storage pipeline as photos (per-kind MIME/size policy + scan for docs/video); wizard registers real storage keys, never filenames; the pasted URL is demoted to an optional external reference       | Render verified through the wizard; backend grant path covered by `test:media`                                                              | FE `602555f`               |
| 8   | §19 seller verification projection    | `seller: { verified }` on the catalogue card + Rubik row + lot detail (derived from the owner's KYC; only `kycStatus` leaves the DB, never identity); `verifiedOnly` server-side facet + "Verified sellers" filter chip + card pill + lot-detail chip       | **Browser-verified** (verified pill on the verified lot only; filter 4→1; lot-detail chip). `e2e-catalogue-v2` 33/33; contract `--check` ok | BE `1345dec`, FE `f451b17` |
| 9   | §20 inspection/certification evidence | `AssetInspectionEvidence` model + additive migration; staff attach surface (`asset:manage`, not sellers); the previously-unwired `InspectionProvider` port now opens inspections; lot detail projects PUBLIC evidence only (private docs/ids never leak)    | **Browser-verified** (evidence section, cert link, private row absent). `e2e-inspection-evidence` 13/13 (wired into CI)                     | BE `1a8dd60`, FE `fc56807` |
| 10  | §21/§22 Singha Live RW6               | Scoped auctioneer/clerk/producer roles + `live:conduct/clerk/produce`; per-lot `LiveLotState` machine + current-lot pointer + sequencing (open/call/sell/pass/withdraw/next); deterministic fake stream; floor read composes the engine's authoritative bid | **Browser-verified** live room (on-the-block, going once, engine bid, running order). `e2e-live-floor` 25/25 (wired into CI)                | BE `c27df15`, FE `52dff72` |
| 11  | §23 homepage residuals                | Signed-in "needs your attention" rail (from the dashboard read model; hides when signed-out/all-quiet); config-driven "Opportunities near you" strip into the real `?location=` filter; trust copy already customer-benefit framed                          | **Browser-verified** (local strip + region→catalogue link; attention rail absent when signed out)                                           | FE `ea4b01f`               |

Gates verified green this session: BE `format:check` + `lint` (0 errors) + `turbo typecheck` + `build`;
`emit-contract --check` on a fresh DB; FE `format:check` + `lint` (0 errors) + `typecheck` + the CI test
filter (`@singha/web…` + `@singha/auctionflow`, 148 web tests). A tracked demo script's pre-existing
prettier drift was fixed so FE `format:check` stays green (FE `8c6602e`).

## Remaining (from the audit — NOT done; real state)

Also delivered across the continuation sessions (now closed, not repeated in the tables above): **§7/§25
server-resumable seller drafts + auction-preference persistence** (`SellerListingDraft` +
`SellerAuctionPreference` models, optimistic-concurrency CRUD, `test:seller-studio`); **§10/§12 photo-first
AI Vision seller UI** with per-field accept/edit/reject provenance (`VisionIntakePanel` → `POST
/ai/vision/intake`); **§13 real OSS deterministic image adapters** (sharp + exifr behind
`DeterministicImageProvider`, pure `@singha/domain` primitives) + **§14 the evaluation harness**
(`SINGHA_AI_VISION_EVALUATION_REPORT.md`, deterministic corpus in CI).

Genuinely still open (additive, non-customer-blocking):

- **§4 richer category profiles / `scrap` + produce** — PARTIAL (existing schemas enriched; a dedicated
  `scrap` key + produce profile remain additive).
- **§8/§9 quantity/units/Incoterms in the listing wizard** — PARTIAL (present in Evolution components, not
  yet folded into the seller wizard).
- **§18 subcategory/type IA** — MISSING (broad category keys only; per-category subtype taxonomy not yet
  surfaced in the catalogue facets).
- **§24 mobile camera capture** — MISSING. The Vision panel accepts uploads; a mobile live-camera capture
  affordance (getUserMedia) is not yet wired.
- **§26 system public-ref / §27–28 staff approval + AI pre-publish QC gate** — PARTIAL. Listing lifecycle +
  review exist; a system-issued human-readable listing ref and an AI pre-publish QC gate remain additive.

## CI / deployment status

- **Backend (`LakshanV/Auctions-Backend`) `main` CI is GREEN** on all continuation commits — verified on
  the Actions tab: `1345dec` (§19), `1a8dd60` (§20), `c27df15` (§21/§22) all `success`. The continuation
  work added three new E2E gates — `test:inspection-evidence` (§20), `test:live-floor` (§21/§22) and the
  extended `test:catalogue-v2` (§19) — plus the regenerated public-API contract (`emit-contract --check`).
- **Frontend (`MUA1234/Auctions-New`) GitHub Actions is OWNER-GATED and cannot execute.** Every `main` run
  — including ones from before this programme — fails in ~3 s with **zero steps executed** (job "verify"
  created then immediately fails), the signature of Actions being disabled / billing-locked on the
  **MUA1234 account** (a different owner from the backend's LakshanV). This is NOT a code defect: the exact
  CI gates (`format:check`, `lint` 0-errors, `turbo typecheck`, and the `@singha/web…`+`@singha/auctionflow`
  test filter — 148 web tests) all pass locally on every commit. **Owner action:** enable GitHub Actions /
  clear the spending limit on the MUA1234 account. The FE still ships to production via **Vercel**, which
  builds independently of GitHub Actions and is unaffected.
- Demo-cover prod population is a one-click `workflow_dispatch` (needs the `PROD_DATABASE_URL` secret) — see
  `.github/workflows/seed-marketplace.yml`.

## Owner / provider / legal gates (unchanged; not engineering-closable)

- **OWNER_ONLY** SEC-1/2/3 (private repos, branch protection, GHAS); `PROD_DATABASE_URL` secret for the
  demo reseed; **GitHub Actions enablement / billing on the MUA1234 (frontend) account** so the FE CI can
  execute (code already passes every gate locally; Vercel deploy is unaffected).
- **PROVIDER_GATED** PRV-1 (vision model), PRV-2 (payments/FX/logistics/WhatsApp/voice/streaming),
  PRV-3 (GSI/gem-lab); real photographic 4-view demo imagery.
- **LEGAL_GATED** O1–O8.
