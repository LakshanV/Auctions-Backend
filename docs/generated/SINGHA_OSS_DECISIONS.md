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
