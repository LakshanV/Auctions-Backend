# SINGHA — Final Product Intent Gap Audit

Fresh reconciliation of `origin/main` in both canonical repos against the **Final Product Intent
Correction** directive. Method: five parallel read-only investigations of the seller Listing Studio,
backend config/Vision/media APIs, the AI vertical + OSS adapters, demo media/gallery/taxonomy, and
Singha Live + homepage — each citing `file:line`. Classification legend: **ALREADY_CORRECT ·
PARTIAL · INCORRECT · MISSING · OWNER_ONLY · PROVIDER_GATED · LEGAL_GATED**.

Ground truth at audit time: Backend `main` `761f709` (+ CI-green fix `a46ff79`), Frontend `main`
`6919fd1`. Prior programme merged: E0–E15, V3-1…10, CX Overhaul, RW0–RW10.

## Headline finding

The divergence is almost entirely **one shape**: the **authoritative backend already exists**
(canonical sale-method / currency / unit taxonomies, category schemas, photo-first Vision intake,
secure media pipeline, listing lifecycle state-machine, auction engine), but the **customer-facing
seller Listing Studio (`apps/web/src/app/sell/new/page.tsx`) does not consume it** — it hard-codes
categories, sale methods and currency, drops auction inputs into a local note, uses only the older
text AI call, and never uploads documents/video. A **few backend models are genuinely missing**
(category field-schema endpoint, server-backed seller draft, seller auction-preference persistence,
inspection-evidence attachment). So most work is **frontend integration + a few additive backend
endpoints/models**, not a rebuild — exactly what the directive anticipated ("a backend API plus a
mock does NOT equal a finished customer feature").

Also found and **already fixed** this session: `main` CI had been red since RW2 merged — a strict
`noUncheckedIndexedAccess` typecheck error in `vision.test.ts` (+ an unformatted workflow). Fixed in
`a46ff79`; full `check` (format+lint+typecheck+build+test) passes.

## §41 Correction matrix

Legend for cells: ✅ done · ◑ partial · ✗ missing/incorrect · n/a. "Final State" is the target class.

| Capability                                             | Backend                                     | Customer UI                                       | Staff UI         | Real Browser E2E | Provider                 | Final State                                       |
| ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------- | ---------------- | ---------------- | ------------------------ | ------------------------------------------------- |
| Seller category selection (config-driven)              | ◑ schemas exist, no field-schema endpoint   | ✗ hard-coded `CATEGORY_FIELDS`, no `bulk`         | n/a              | ✗                | local                    | **PARTIAL→build**                                 |
| Bulk/produce listing                                   | ◑ `bulk` key + attrs                        | ✗ absent from wizard                              | n/a              | ✗                | local                    | **INCORRECT→build**                               |
| Scrap/material listing                                 | ✗ no `scrap` key                            | ✗                                                 | n/a              | ✗                | local                    | **MISSING→additive schema**                       |
| Dynamic sale methods                                   | ✅ `GET /platform/sale-methods` (17 defs)   | ✗ hard-coded 6-array                              | n/a              | ✗                | local                    | **INCORRECT→wire**                                |
| Multi-currency listing                                 | ✅ `/fx/currencies`, per-currency exponent  | ✗ LKR hard-coded, ×100                            | n/a              | ✗                | local                    | **INCORRECT→wire**                                |
| Auction preference persistence                         | ✗ no model                                  | ✗ local note only                                 | ✗                | ✗                | local                    | **MISSING→build**                                 |
| Structured logistics (Incoterm/port)                   | ✅ Incoterm/port config                     | ◑ free-text city only in wizard                   | n/a              | ◑                | local                    | **PARTIAL→wire**                                  |
| AI Vision photo intake                                 | ✅ `POST /ai/vision/intake`                 | ✗ FE never calls it                               | n/a              | ✗                | mock (PRV-1)             | **INCORRECT→wire**                                |
| Capture coach                                          | ✅ kernel                                   | ✗ no UI                                           | n/a              | ✗                | mock                     | **INCORRECT→wire**                                |
| AI condition report                                    | ✅ advisory fields                          | ✗                                                 | n/a              | ✗                | mock                     | **PARTIAL→wire**                                  |
| AI valuation                                           | ✅ comparables-based                        | ✗                                                 | n/a              | ✗                | local                    | **PARTIAL→wire**                                  |
| AI eval harness                                        | ✗                                           | n/a                                               | n/a              | ✗                | n/a                      | **MISSING→build**                                 |
| AI listing-draft contract                              | ✗ FE/BE shapes mismatch → 400; silent catch | ◑ button exists, always fails                     | n/a              | ✗                | mock                     | **INCORRECT→fix**                                 |
| Document upload                                        | ✅ pipeline                                 | ✗ local filenames only                            | n/a              | ✗                | mock scan                | **INCORRECT→wire**                                |
| Video upload                                           | ✅ pipeline                                 | ✗ URL text field                                  | n/a              | ✗                | mock scan                | **INCORRECT→wire**                                |
| 4-view demo media                                      | ✅ seeder default 4 + manifest              | ✅ 216 svg + 54 png committed                     | n/a              | ◑                | local (real imagery PRV) | **ALREADY_CORRECT (real imagery PROVIDER_GATED)** |
| Listing gallery (swipe/zoom/video)                     | n/a                                         | ◑ cover+thumbs; no arrows/swipe/zoom/inline-video | n/a              | ◑                | local                    | **PARTIAL→build**                                 |
| Seller verification projection                         | ◑ data exists, not projected                | ✗ no badge/filter                                 | n/a              | ✗                | local                    | **MISSING→build**                                 |
| Inspection/certification evidence                      | ◑ port only, no model                       | ✗                                                 | ✗                | ✗                | mock (PRV-3)             | **PARTIAL→build**                                 |
| Server-resumable seller draft                          | ✗                                           | ✗ localStorage only                               | n/a              | ✗                | local                    | **MISSING→build**                                 |
| Seller quality-control lifecycle                       | ◑ draft→review→approved exists              | ◑ status shown                                    | ◑ approve/reject | ◑                | local                    | **PARTIAL→extend**                                |
| AI QC preflight before publish                         | ✗                                           | ✗                                                 | ✗                | ✗                | local                    | **MISSING→build**                                 |
| System-generated public ref                            | ✗ seller invents                            | ✗                                                 | n/a              | ✗                | local                    | **INCORRECT→fix**                                 |
| Category subcategory/type IA                           | ✗ broad keys only                           | ✗                                                 | n/a              | ✗                | local                    | **MISSING→build**                                 |
| Live staff roles                                       | ✗ single `live:operate`                     | ✗ placeholder console                             | ✗                | ✗                | mock                     | **INCORRECT→build**                               |
| Live multi-lot sequencing                              | ◑ ordered lots, no state/current-lot        | ✗ landing only                                    | ✗                | ✗                | mock                     | **PARTIAL→build (migration)**                     |
| Live customer experience                               | ◑ engine SSE reconnect ok                   | ✗ no live room                                    | n/a              | ◑ bidding only   | mock stream              | **PARTIAL→build**                                 |
| Homepage "attention"                                   | ✅ `ExchangeActivity` real                  | ◑ at /account/activity, not home                  | n/a              | ◑                | local                    | **PARTIAL→place**                                 |
| Local opportunities                                    | ✗                                           | ✗                                                 | n/a              | ✗                | local                    | **MISSING→build**                                 |
| Services discovery                                     | ◑ static tiles + 1 gated link               | ◑                                                 | n/a              | ◑                | local                    | **PARTIAL→config-drive**                          |
| OSS deterministic AI adapters                          | ✗ interface-only, no libs                   | n/a                                               | n/a              | ✗                | none                     | **MISSING→ship**                                  |
| WhatsApp / voice / payment / FX / logistics activation | ✅ ports+fakes                              | n/a                                               | n/a              | ✗                | PROVIDER_GATED           | **PROVIDER_GATED**                                |

## Per-section classification (evidence + smallest safe fix)

- **§2–3 Config-driven categories + form engine — PARTIAL/INCORRECT.** Wizard hard-codes
  `CATEGORY_FIELDS` (`sell/new/page.tsx:36-60`, no `bulk`); backend `CATEGORY_SCHEMAS` (Zod) exist
  (`packages/contracts/src/categories.ts`) but no customer-safe field-schema endpoint. **Fix:** add
  `GET /platform/category-schemas` serializing field descriptors (key/label/type/unit/required/enum/
  min/max/help/visibility/version); FE renders dynamically.
- **§4 Richer category profiles — PARTIAL.** Add versioned additive profiles (produce, scrap) without
  breaking existing assets. `scrap` category key missing entirely.
- **§5 Config-driven sale methods — INCORRECT.** `GET /platform/sale-methods` already returns 17
  active-gated defs; wizard uses a hard-coded 6-array (`sell/new/page.tsx:62-69`). **Fix:** consume the
  endpoint.
- **§6 Multi-currency seller flow — INCORRECT.** `/fx/currencies` + per-currency exponent exist;
  wizard hard-codes LKR + ×100 (`format.ts:4,11`; `sell/new/page.tsx:360`). **Fix:** currency selector
  - `formatMoneyExp`/`CurrencyAmountInput` (already built for Evolution) in the listing path.
- **§7 Auction settings must persist — MISSING.** Opening/reserve/increment captured then dropped to
  a note (`sell/new/page.tsx:410-411`); no backend model. **Fix:** `SellerAuctionPreference` model +
  `POST /listings/:id/auction-preferences` (staff-approvable), FE persists.
- **§8–9 Quantity/units/logistics — MISSING/PARTIAL in wizard.** All fields + Incoterm inputs exist in
  Evolution components; not in the listing wizard. **Fix:** integrate into the wizard behind the
  category/sale-method that needs them.
- **§10–12 AI Vision UI + accept/edit/reject — INCORRECT.** `POST /ai/vision/intake` exists and is
  advisory/provenanced; FE never calls it (only text `/ai/listing-draft`). No accept/edit/reject
  persistence. **Fix:** photo-first intake step + capture coach + per-field accept/edit/reject that
  records the human decision.
- **§11 AI listing-draft contract drift — INCORRECT (real bug).** FE sends `{category,attributes,
notes}`; BE requires `{assetId,locale}` → every call 400s; `catch{return null}` hides it
  (`api.ts:80-89,86-88`). **Fix:** align the contract, remove the silent swallow, add telemetry, add a
  FE↔BE contract test.
- **§13 OSS deterministic adapters — MISSING.** No sharp/exif/tesseract/opencv/onnx installed; only
  mock. **Fix:** ship real CPU adapters (image metadata/EXIF, blur/quality via sharp, perceptual hash,
  dup detection) behind the existing ports; keep VLM PROVIDER_GATED; update `SINGHA_OSS_DECISIONS.md`.
- **§14 AI eval harness — MISSING.** Build versioned corpus + metrics; `SINGHA_AI_VISION_EVALUATION_REPORT.md`.
- **§15 Document/video upload UI — INCORRECT.** Pipeline exists (`media.controller.ts`); wizard stores
  filenames / a video URL. **Fix:** real upload-grant → upload → register with scan status.
- **§16–17 Demo media + gallery — ALREADY_CORRECT / PARTIAL.** 4-view plumbing + manifest done (216
  svg + 54 png). Gallery lacks arrows/swipe/zoom/inline-video (`LotGallery.tsx`). Real photographic
  4-view imagery is PROVIDER_GATED (image-gen key or owner photos).
- **§18 Taxonomy IA — MISSING.** Only broad keys surfaced; add customer-facing subcategory/type.
- **§19 Seller verification projection — MISSING.** Authoritative verification exists
  (`operator/node/customer` verified) but is not projected to the catalogue; badge/filter disabled.
  **Fix:** project a customer-safe `verified` state; enable badge/filter (owner-gated label wording).
- **§20 Inspection/certification — PARTIAL.** `InspectionProvider` port unwired, no evidence model.
  **Fix:** evidence model (provider/reference/date/status/media/visibility) + attach surface.
- **§21–22 Singha Live (RW6) — INCORRECT/PARTIAL.** No auctioneer/clerk/producer roles (single
  `live:operate`); ordered lots exist but no per-lot state / current-lot pointer / sequencing ops;
  deterministic fake stream absent (`Date.now`/`Math.random`). Engine authority already correct.
  **Fix:** additive migration (lot state + current-lot), sequencing ops, scoped role capabilities,
  deterministic fake stream, minimal live-room consumer.
- **§23 Homepage residual (RW7) — PARTIAL.** Real attention model exists at `/account/activity` (hides
  when empty) — place a signed-in home rail; add local-opportunities (needs location surface); make
  Services config-driven; rewrite trust copy to customer benefit.
- **§24–28 Mobile camera / server draft / public ref / lifecycle / AI QC — MISSING/INCORRECT** per
  the seller-studio items above.
- **§35 Repo security — Actions now RUN** (billing lock cleared; the CI red was a code defect, now
  fixed). Branch protection / private-repo / GHAS remain OWNER_ONLY.
- **§36–37 Provider / legal gates — unchanged** (PRV-1/2/3, O1–O8).

## Prioritized build sequence (this programme)

1. **P0 CI green** — done (`a46ff79`).
2. **Backend additive (unblocks FE):** category field-schema endpoint; fix `/ai/listing-draft`
   contract; `SellerAuctionPreference` + server-backed `SellerDraft` models/endpoints;
   inspection-evidence model; `scrap` + produce profile additive schemas.
3. **Seller Listing Studio integration:** config-driven categories + form engine; sale-methods;
   multi-currency; persist auction prefs; quantity/units/logistics; AI Vision photo-first +
   accept/edit/reject; real doc/video upload; system public ref; server-resumable draft; AI QC preflight.
4. **OSS deterministic adapters** (sharp/EXIF/blur/pHash) + eval harness + `SINGHA_OSS_DECISIONS.md`.
5. **Customer surfaces:** gallery (arrows/swipe/zoom/video); taxonomy subcategory IA; verification
   projection; homepage attention/local/services/trust copy.
6. **Singha Live RW6:** migration + lot state-machine + roles + fake stream + live-room consumer.
7. **Retest:** browser pilot (Playwright UI-primary), auction retest with galleries, AI search on
   richer taxonomy, responsive 360–1920, adversarial security.
8. **Docs:** `SINGHA_FINAL_PRODUCT_INTENT_COMPLETION_REPORT.md` + `SINGHA_REMAINING_WORK_FINAL_REPORT.md`
   with per-feature backend/FE/browser/API/DB/security/flag/provider states — no "COMPLETE" where a
   customer cannot use it.

Provider/owner/legal-gated items (PRV-1/2/3, O1–O8, SEC-1/2/3) are recorded and NOT counted as
engineering-incomplete.
