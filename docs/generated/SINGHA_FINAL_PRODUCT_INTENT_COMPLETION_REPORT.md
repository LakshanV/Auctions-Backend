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

## Remaining (from the audit — NOT done; real state)

Backend largely exists; these are the still-open customer-path integrations + a few additive models.

- **§4 richer category profiles / `scrap`** — PARTIAL. Enriched existing schemas; a dedicated `scrap`
  key + produce profile remain additive TODO.
- **§7 auction-preference persistence** — MISSING model. Wizard still records opening/reserve/increment
  as a note (needs `SellerAuctionPreference` + endpoint, staff-approvable).
- **§8/§9 quantity/units/logistics in the wizard** — PARTIAL. Fields/Incoterm inputs exist in Evolution
  components; not yet in the listing wizard.
- **§10/§12 AI Vision photo-first UI + accept/edit/reject** — INCORRECT. `POST /ai/vision/intake` exists
  and is advisory/provenanced; the wizard still doesn't call it; no per-field accept/edit/reject store.
- **§13 OSS deterministic adapters** — MISSING. OCR/blur/quality/EXIF/hash/dedup/embeddings are still
  interface+mock (no real libs). Ship real CPU adapters (exifr/jimp) + eval harness (§14), then
  update `SINGHA_OSS_DECISIONS.md`.
- **§14 AI eval harness** — MISSING.
- **§15 document/video upload UI** — INCORRECT. Pipeline exists; wizard still stores filenames / a video
  URL string (photos already use the real signed pipeline).
- **§18 subcategory/type IA** — MISSING (broad keys only surfaced).
- **§19 seller verification projection** — MISSING. Verification data exists backend-side but is not
  projected to the catalogue (badge/filter). (Touches the public-api contract snapshot.)
- **§20 inspection/certification evidence** — PARTIAL (port only; no evidence model).
- **§21/§22 Singha Live RW6** — INCORRECT/PARTIAL. No auctioneer/clerk/producer roles; ordered lots exist
  but no per-lot state / current-lot pointer / sequencing ops; deterministic fake stream absent. Needs
  an additive migration.
- **§23 homepage attention/local/services** — PARTIAL. Trust copy done; the real attention model lives at
  `/account/activity` (needs a signed-in home rail); local-opportunities + config-driven services remain.
- **§24 mobile camera / §25 server-resumable draft / §26 system public-ref / §27–28 approval + AI QC** —
  MISSING/INCORRECT per the seller-studio items.

## CI / deployment status

- **GitHub Actions runs** (the old billing lock is cleared). `main` CI: the code defect that kept it red
  is fixed (`a46ff79`); subsequent pushes should be green — confirm on the Actions tab.
- Frontend deploys to Vercel on `main`; backend to Railway. Demo-cover prod population is a one-click
  `workflow_dispatch` (needs the `PROD_DATABASE_URL` secret) — see `.github/workflows/seed-marketplace.yml`.

## Owner / provider / legal gates (unchanged; not engineering-closable)

- **OWNER_ONLY** SEC-1/2/3 (private repos, branch protection, GHAS); `PROD_DATABASE_URL` secret for the
  demo reseed.
- **PROVIDER_GATED** PRV-1 (vision model), PRV-2 (payments/FX/logistics/WhatsApp/voice/streaming),
  PRV-3 (GSI/gem-lab); real photographic 4-view demo imagery.
- **LEGAL_GATED** O1–O8.
