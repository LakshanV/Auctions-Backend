# SINGHA — AI Vision Evaluation Report (§14)

The self-evaluation harness for the photo-first seller intake. It separates the **deterministic
local tasks** (real OSS, shipped, benchmarked here) from the **semantic VLM tasks** (category /
make-model / OCR / condition / hallucination), which are **PROVIDER_GATED (PRV-1)** and measured
the moment a real vision model is bound — the harness slots are defined so those numbers drop in
without restructuring.

## What is real and measured now (deterministic OSS — §13)

`DeterministicImageProvider` (sharp — Apache-2.0 / libvips LGPL dynamically linked; exifr — MIT)
feeds the pure `@singha/domain` primitives. No model, no weights, no external call, no per-call
cost. Reproducible synthetic corpus, run in CI:

| Task                     | Method                                       | Corpus (synthetic, deterministic)                  | Result                                                                                     |
| ------------------------ | -------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Blur / focus             | 3×3 Laplacian variance                       | crisp checkerboard vs its 8px-blurred copy         | crisp scored **sharp**, blurred **not**; variance strictly greater on the crisp image      |
| Exposure (under / glare) | grayscale histogram (clipped-dark / -bright) | solid 2, solid 253, solid 128                      | near-black → **tooDark**, near-white → **glare**, mid-grey → **neither**                   |
| Perceptual hash + dedup  | 9×8 dHash + Hamming distance                 | gradient vs recompressed(q60) vs mirrored gradient | recompressed copy → **duplicate**, mirrored image → **not** (robust to JPEG recompression) |
| Metadata                 | sharp intrinsics + exifr EXIF/GPS            | 320×320 synthetic JPEG                             | dimensions extracted; **no GPS** correctly reported                                        |

Tests: `apps/api/src/modules/vision/adapters/deterministic-image.spec.ts` (4) +
`packages/domain/src/modules/vision/deterministic.test.ts` (4) — all green. Primitives:
`laplacianVariance`, `exposureStats`, `dHash`, `hammingDistance`, `isPerceptualDuplicate`.

Interpretation: the deterministic capture-coach signals (is this photo usable? is it a duplicate of
another? what does EXIF say?) are now genuine local computations, not a mock — closing the §13
"don't mark OSS-ready when only a mock exists" gap for these tasks.

## What is defined but PROVIDER_GATED (semantic VLM — PRV-1)

Measured when a real model (self-hosted Qwen2-VL / Llama-3.2-Vision, or a managed VLM) is bound to
`VISION_PROVIDER`. Until then the mock echoes seller hints with honest `uncertain` states, so no
fabricated numbers enter the corpus:

- category accuracy, make/model accuracy, OCR (plate / VIN / serial / odometer), structured field
  extraction, condition precision, false-positive rate, missing-view detection, **confidence
  calibration**, **hallucination rate**, image-similarity accuracy, valuation error band.

Harness note: because deterministic dedup + quality already run locally, the VLM only needs to be
scored on the _semantic_ rows above — the local rows never regress when the model changes.

## Activation path

`DeterministicImageProvider` needs one thing to run in the live intake flow: the image **bytes**.
Today the intake passes nominal per-photo refs (no bytes leave the browser). When the secure media
pipeline hands the vision service the stored original (or the browser sends a downscaled analysis
copy), the provider runs unchanged — it is already DI-registered in `VisionModule`.
