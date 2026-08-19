# SINGHA — Open-Source Decisions (AI Vision, media, valuation)

OSS-first evaluation for the RW2 (photo-first AI seller intake), RW3 (secure media) and RW9
(provider ports) work. Objective: **best technical fit + commercially-safe permissive licence +
replaceability + deployment control + cost + maintainability** — not "OSS at any cost", not
popularity.

Singha is proprietary commercial software. **Prefer Apache-2.0 / MIT / BSD.** Strong copyleft
(AGPL / GPL) is only acceptable when the component runs as an **isolated external service** the
Singha app calls over a socket/CLI (no linking, no derivative work) — recorded per case below.
Code licence and **model-weight licence are verified separately** (a permissive repo can ship
non-commercial weights).

Every choice is wired behind a **provider-neutral Singha interface** (RW2/RW9), so the concrete
engine is swappable for self-hosted OSS, a managed cloud model, or a future Singha model with no
domain change. In this environment there is no GPU and model downloads are egress-blocked, so the
engineering deliverable is **interface + deterministic fake + tests + config + rollout path**; real
model activation is **PROVIDER_GATED**.

## Decision summary (per Singha interface)

| Singha interface                             | Subtask                                                   | Selected OSS (self-host)                                                                 | Code licence                            | Weights licence                                                   | Why / fallback                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OCRProvider`                                | reg plates, VIN/serial tags, odometer, hour-meter, labels | **Tesseract** (primary), **PaddleOCR** (higher accuracy)                                 | Apache-2.0                              | Apache-2.0                                                        | Deterministic, CPU, local — no LLM needed for text. Fallback: cloud OCR adapter.                                                                                         |
| `ObjectDetectionProvider`                    | localise vehicle/machinery/parts, damage regions          | **RT-DETR / YOLOX / MMDetection**                                                        | Apache-2.0                              | Apache-2.0                                                        | ⚠️ **Explicitly AVOID Ultralytics YOLOv8/v11 — AGPL-3.0** (copyleft, unsafe for proprietary). Fallback: managed detection.                                               |
| `SegmentationProvider`                       | isolate subject, panel/region masks                       | **SAM 2 / MobileSAM**                                                                    | Apache-2.0                              | Apache-2.0                                                        | Meta SAM family is Apache-2.0 (code + weights). MobileSAM for edge/CPU.                                                                                                  |
| `ImageEmbeddingProvider`                     | similarity, duplicate-item, relisting/fraud review        | **OpenCLIP** (primary), **DINOv2**                                                       | MIT / Apache-2.0                        | MIT (OpenAI/LAION) / Apache-2.0                                   | Advisory matching only; never auto-merge. Verify specific LAION checkpoint licence at pin time.                                                                          |
| `ImageQualityProbe` (deterministic)          | blur, exposure, glare, subject-too-small                  | **OpenCV** (Laplacian variance, histogram)                                               | Apache-2.0                              | n/a (no model)                                                    | Pure/deterministic, local, cheap — the capture-coach primary signal. No model risk.                                                                                      |
| inference runtime                            | run the above ONNX graphs                                 | **ONNX Runtime**                                                                         | MIT                                     | n/a                                                               | Provider-neutral runtime; CPU + optional GPU EP.                                                                                                                         |
| `MediaProcessor`                             | image thumbnails/derivatives                              | **sharp** (libvips)                                                                      | Apache-2.0 (sharp) / LGPL-2.1 (libvips) | n/a                                                               | libvips dynamically linked → LGPL boundary safe.                                                                                                                         |
| `MediaProcessor`                             | video poster/thumbnail, transcode                         | **ffmpeg (LGPL build)** in an isolated worker                                            | LGPL-2.1 (LGPL build)                   | n/a                                                               | Use the LGPL build (avoid GPL codecs); run in an isolated media worker, never in the API.                                                                                |
| `MalwareScanner`                             | scan uploaded docs/video before SAFE                      | **ClamAV** `clamd`                                                                       | **GPL-2.0**                             | n/a                                                               | **Isolated daemon** — Singha calls it over a socket/CLI, no linking → GPL boundary respected. Documented legal boundary. Fallback: managed AV adapter.                   |
| `DocumentParser`                             | extract text/metadata from PDFs/certs                     | **Apache Tika** (service) / **pdfminer.six**                                             | Apache-2.0 / MIT                        | n/a                                                               | Run Tika as an isolated service.                                                                                                                                         |
| `ValuationModelProvider`                     | evidence-based price bands                                | **scikit-learn / statsmodels** (interpretable)                                           | BSD-3 / BSD                             | n/a                                                               | Prefer interpretable regression over a black-box before enough data exists; primary signal stays Singha comparables (prior sales / current listings).                    |
| `VisionIntelligenceProvider` (VLM reasoning) | ambiguous recognition, cross-image damage synthesis       | pluggable — self-host **Qw2-VL / Llama-3.2-Vision** OR managed (Anthropic/OpenAI/Google) | Apache-2.0 (Qwen code)                  | ⚠️ **verify per model** (Llama = Meta community licence, not OSI) | Use a strong VLM ONLY where semantic reasoning adds value; deterministic/local subtasks above handle the rest. Provider-neutral so the owner picks self-host vs managed. |

## Demo/synthetic image generation (marketplace visual population)

Populating the demo catalogue with believable imagery is a **generation** problem distinct from the
product vision pipeline. Kept provider-neutral and replaceable behind one script
(`apps/web/scripts/gen-demo-media.mjs`, manifest-driven):

| Option                                      | Engine                                                                         | Licence posture                                                                                                                                                 | Fit / when                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Procedural SVG** (default)                | self-written vector generator                                                  | CC0 / owned — no model, no weights                                                                                                                              | credential-free fallback; always works offline; not photographic   |
| **Managed — OpenAI Images** (`gpt-image-1`) | OpenAI API                                                                     | commercial terms; outputs usable per OpenAI terms                                                                                                               | selected default for real images (owner key) — needs network + key |
| **Managed — Stability / Replicate**         | hosted SDXL/Flux                                                               | verify per-model output terms                                                                                                                                   | alternative managed path                                           |
| **Self-host OSS**                           | **SDXL / SD-3.5 / Flux.1-\[dev\]** via ComfyUI/Automatic1111 (Apache/MIT code) | ⚠️ **weights licence varies** — SDXL (OpenRAIL/CreativeML) and Flux-dev (non-commercial) vs Flux-schnell (Apache-2.0); **verify commercial use per checkpoint** | best cost/control at scale on a GPU box; anti-clone (on-prem)      |

Guardrails (directive §4/§23): **no scraping, no hotlinking, no unclear-copyright assets**; verify
**code licence AND model-weight/commercial-use terms** before a checkpoint goes to production;
generation stays **replaceable** (swap the `--provider` adapter; the media pipeline + listing domain
never change). True multi-view same-item identity (four coherent photos of ONE item) needs
img2img / IP-Adapter / a reference image, or a real owner photo set — a documented upgrade beyond
independent text-to-image calls.

**Environment note:** real generation is PROVIDER_GATED here — the controlled sandbox has no
image-gen key, egress to image APIs is blocked, and there is no GPU; the generator therefore ships
built + dry-run-verified, to be run where a key/GPU + network exist.

## Model / cost routing (product AI)

1. **Deterministic / local first** — OCR, blur/quality, hashing, EXIF, dedup embeddings, basic
   detection/segmentation. No LLM, no per-call cost, runs offline, best privacy + anti-clone.
2. **Small / cheap AI** — simple categorisation, structured attribute extraction, low-risk copy.
3. **Strong multimodal** — only ambiguous recognition, cross-image reasoning, conflicting-evidence
   synthesis, final draft. Track model/provider/version + latency + est. cost on each `AiRun`.

## Anti-clone / licence guardrails (enforced in code review)

- **No AGPL / strong-GPL code linked into the app.** Ultralytics YOLO is the concrete trap → use
  RT-DETR/YOLOX/MMDetection (Apache-2.0) instead.
- **Copyleft only as an isolated service** (ClamAV, ffmpeg worker, Tika) — never a library link.
- **Weights licence verified separately** from code; non-commercial / research-only weights are
  rejected for production.
- **No user-controlled checkpoint URLs**; pin versions + verify checksums; isolate inference;
  authenticate internal endpoints; resource-limit; log model version (see RW27 model-deploy safety).

## Deployment posture (PROVIDER_GATED activation)

All of the above are integrated behind Singha interfaces with **deterministic credential-free
fakes** so the full flow is engineering-complete and testable now. Real activation needs owner
infra (CPU/GPU host, model download, or a managed key) and is marked **PROVIDER_GATED (PRV-1)** in
`SINGHA_REMAINING_WORK_OPEN_ITEMS.md`. AI must **degrade gracefully** — if vision/OCR/valuation is
unavailable the seller completes the listing manually.

## Shipped status (directive §13/§14 — real, not mock)

The deterministic local tasks are now REAL implementations, not interface+mock:

- **`DeterministicImageProvider`** (`apps/api/src/modules/vision/adapters/`) — **sharp** (Apache-2.0;
  libvips LGPL, dynamically linked → boundary safe) for decode/resize + **exifr** (MIT) for EXIF/GPS,
  feeding pure `@singha/domain` primitives (`laplacianVariance`, `exposureStats`, `dHash`,
  `hammingDistance`, `isPerceptualDuplicate`). Covers **blur/quality, exposure/glare, perceptual
  hashing + duplicate detection, and metadata** — no key, no per-call cost, CPU-local. DI-registered
  in `VisionModule`. Benchmarked on a reproducible synthetic corpus
  (`deterministic-image.spec.ts` + `deterministic.test.ts`, all green) — see
  `SINGHA_AI_VISION_EVALUATION_REPORT.md`.
- **OCR (Tesseract/PaddleOCR), object detection, segmentation, embeddings, and the semantic VLM**
  remain PROVIDER_GATED (need model weights / a managed key); the ports + the deterministic layer
  above are the activation-ready foundation.

Weights-licence note re-confirmed: sharp/libvips/exifr carry no model weights (pure algorithms), so
there is no non-commercial-weights risk for the shipped deterministic layer.

---

# CRM / Operations OSS Completion Pass (§8–§16, §24)

Second OSS evaluation round, for the CRM / operations / analytics enhancement pass. The governing
constraint is stronger than "prefer permissive": **Singha stays the single source of truth for
Customer, Singha ID, KYC, orgs, assets, auctions, bids, offers, tenders, procurement, supply,
payments, logistics, Buyer Twin, conversations, AI provenance, audit and permissions.** Any OSS
component is adopted **only as a replaceable sidecar / adapter that never becomes a second source
of truth** — it reads a projection or runs alongside; it never owns an authoritative record.

## Decision summary

| Component                 | Role considered                          | Licence                                       | Verdict (this pass)                          | Rationale                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------- | --------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Twenty CRM**            | generic CRM system of record             | **AGPL-3.0** + separate enterprise licence    | ❌ **DO NOT EMBED / NOT ADOPTED**            | AGPL copyleft is unsafe to embed in proprietary software, and adopting a generic CRM as the customer/company record would create a **second source of truth** competing with Singha's authoritative Customer/Singha ID — the exact anti-goal. Singha-native CRM primitives built instead (see below).                         |
| **Chatwoot**              | agent inbox / omnichannel helpdesk UI    | MIT (community) + enterprise add-ons          | ⭕ **OPTIONAL sidecar — deferred**           | A capable OSS inbox, but the pilot needs the inbox to act on **Singha's** authoritative conversations, bid-intents and RBAC. Built a **Singha-native Agent Inbox** (§4) over the existing Connect model instead. Chatwoot remains a possible future front-end sidecar via the Connect adapter — never the conversation store. |
| **Apache Superset**       | staff BI / dashboards / Market Pulse     | **Apache-2.0**                                | ✅ **RECOMMENDED (P2) — owner-deploys**      | Read-only BI over a **read replica / warehouse projection**, never writing to authoritative tables. Permissive licence, self-hostable, no lock-in. Owner-gated (needs infra + a replica). Singha keeps owning the numbers; Superset only visualises them.                                                                     |
| **OpenTelemetry**         | tracing / metrics / logs standard        | **Apache-2.0**                                | ✅ **ADOPTED (P1d — shipped)**               | Vendor-neutral instrumentation; the OTLP exporter is the single replaceable seam (any collector). Wired disabled-by-default in the API (`apps/api/src/tracing.ts`). No lock-in — see the OpenTelemetry decision detail below.                                                                                                 |
| **pgvector**              | first vector layer (semantic/dup search) | **PostgreSQL licence** (BSD-like, permissive) | ✅ **RECOMMENDED (P2) — first vector layer** | Vectors live **inside the authoritative Postgres** (one datastore, one backup/restore, one security boundary) — no separate vector store to keep in sync. Adopt when semantic search / duplicate-item / Buyer-Twin similarity needs it.                                                                                       |
| **Qdrant**                | scale-out vector database                | Apache-2.0                                    | ⏸️ **DEFER (P3) — scale-out only**           | Only if/when pgvector is outgrown (very large vector volume / latency). Adds a second datastore to operate + sync, so it is a scale decision, not a pilot one.                                                                                                                                                                |
| **Meilisearch**           | typo-tolerant catalogue search           | MIT                                           | ⏸️ **DEFER (P3) — benchmark-gated**          | Current search is Postgres `ILIKE`/FTS, adequate at pilot catalogue scale. Adopt only after a benchmark shows Postgres FTS is the bottleneck; behind a `SearchProvider` adapter so the catalogue domain never changes.                                                                                                        |
| **PaddleOCR / Tesseract** | OCR (plates, VIN, serial tags)           | Apache-2.0 (both)                             | ✅ **benchmark PaddleOCR vs Tesseract**      | Already covered in the Vision OSS section above. Both permissive, CPU-local, deterministic; PROVIDER_GATED on model weights.                                                                                                                                                                                                  |
| **Temporal**              | durable long-running workflow engine     | MIT                                           | ⏸️ **DEFER (P3 / optional)**                 | The **transactional outbox + BullMQ** already cover current async needs (settlement, notifications, media). Temporal only earns its operational weight for genuinely long-running, multi-day human-in-the-loop sagas — not yet.                                                                                               |

## What was built Singha-native instead (this pass)

Rather than adopt a generic CRM, the pass added **authoritative, Singha-native** CRM primitives so
no second source of truth is introduced:

- **CRM Notes + Tasks** (`crm` module) — append-only internal notes (DB-trigger enforced) + polymorphic
  follow-up tasks linked to existing authoritative records. A sensitive (compliance/financial) task
  can only be closed by a human; AI may suggest, never silently close.
- **Staff Customer 360** — the identity/credit Member 360 extended with contact, channel identities,
  a unified chronological **timeline projection** (a read model over the owning domains — never a
  second ledger) and a transactional-history summary.
- **Agent Inbox** — a staff queue over the existing Connect `Conversation` model with filters, SLA
  signal, explicit assignment, a `resolved` lifecycle state, and an **advisory-only** AI reply
  suggestion (drafts through the sanctioned, guarded `AI_PROVIDER`; the human sends).

These are all first-party, RBAC-gated (`crm:read`/`crm:manage`/`connect:operate`), audited, and
staff-internal (never exposed to a customer surface, §19).

## OpenTelemetry decision detail (§12 — ADOPTED, P1d)

- **Selected:** OpenTelemetry (Apache-2.0) — `@opentelemetry/{sdk-node, api, resources,
semantic-conventions, exporter-trace-otlp-http, instrumentation-http, instrumentation-nestjs-core}`.
- **Replaceable exporter (no lock-in):** spans export over **OTLP/HTTP** using the standard
  `OTEL_EXPORTER_OTLP_*` env — point it at Jaeger, Tempo, Grafana Alloy, an OTel Collector, or any
  OTLP SaaS with **no code change**. The exporter is the single seam; there is no vendor SDK.
- **Safe by default:** disabled unless `OTEL_ENABLED=true` or an OTLP endpoint is set; when off the
  SDK never starts (zero cost). A misconfigured exporter degrades to no tracing and never takes the
  API down (verified by boot test both ways). Health/readiness probes are excluded from tracing.
- **Fits the existing seam:** the `@singha/observability` metrics layer was already designed as a
  drop-in point; OTel complements the in-memory registry rather than replacing it.

## Licence guardrails (this pass)

- **No AGPL embedded in the product.** Twenty CRM (AGPL-3.0) is the concrete trap here → not embedded;
  Singha-native primitives built instead. (Same rule that rejects Ultralytics YOLO in the Vision pass.)
- **No second source of truth.** Every adopted or deferred component is a sidecar/adapter over a
  projection or replica; authoritative records never move out of Singha's Postgres.
- **Permissive-first.** Adopted components this pass (OpenTelemetry, pgvector, Superset) are all
  Apache-2.0 / PostgreSQL-licence. Deferred ones (Meilisearch MIT, Qdrant Apache-2.0, Temporal MIT)
  are permissive too — deferral is about operational weight/benefit, not licence.
- **Replaceable behind an adapter.** Search, vector, BI and inbox all sit behind (or would sit behind)
  a Singha interface, so swapping engines never touches the domain.
