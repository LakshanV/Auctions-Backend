import type { CaptureIssue, CategoryKey, VisionImageRef } from '@singha/contracts';
import type { RawObservation } from '@singha/domain';

/**
 * RW2 — provider-neutral vision port (docs/10; OSS engine matrix in SINGHA_OSS_DECISIONS.md).
 * The concrete engine — self-hosted OSS (Tesseract/RT-DETR/SAM/OpenCLIP behind ONNX Runtime) or a
 * managed VLM — implements THIS interface and nothing else in Singha changes. The provider only
 * ever REPORTS what the photos appear to show; it is never authoritative and never writes a fact.
 * Real activation is PROVIDER_GATED (needs owner infra/keys); until then the mock below runs.
 */

/** What the service hands the provider. `attributes`/`notes` are seller-supplied hints (evidence),
 *  never treated by the provider as ground truth. */
export interface VisionAnalysisInput {
  category?: CategoryKey;
  images: VisionImageRef[];
  attributes?: Record<string, unknown>;
  notes?: string;
  locale?: string;
}

/** The provider's raw report, BEFORE the domain assigns honest states / reconciles seller claims. */
export interface VisionAnalysis {
  /** Best-guess category with its own confidence; the service still honours an explicit seller hint. */
  categoryGuess?: { value: CategoryKey; confidence: number; source: string };
  observations: RawObservation[];
  issues: CaptureIssue[];
  /** The view keys the uploaded photos are judged to cover — drives the capture coach. */
  coveredViews: string[];
}

export interface VisionIntelligenceProvider {
  readonly name: string;
  readonly model: string;
  readonly version: string;
  analyze(input: VisionAnalysisInput): Promise<VisionAnalysis>;
}

export const VISION_PROVIDER = Symbol('VISION_PROVIDER');

/**
 * Deterministic, credential-free vision fake. It exercises the FULL intake flow — capture coaching,
 * field finalisation, seller-claim reconciliation, comparables valuation, provenance recording —
 * with no GPU, no model download and no external call, so the vertical is engineering-complete now.
 *
 * Honesty of the fake: it cannot truly "see", so it does NOT emit high-confidence recognitions. It
 * (a) derives covered views from each upload's `view` hint; (b) corroborates seller-supplied
 * attributes at MODERATE confidence, clearly sourced as mock corroboration (so states land at
 * `probable`/`uncertain`, never a false `observed`); and (c) runs one genuinely deterministic,
 * model-free check — duplicate-image detection by identical storageKey/url. Swapping in a real
 * engine replaces only `analyze()`.
 */
export class MockVisionProvider implements VisionIntelligenceProvider {
  readonly name = 'mock';
  readonly model = 'mock-vision-1';
  readonly version = '1.0.0';

  async analyze(input: VisionAnalysisInput): Promise<VisionAnalysis> {
    const coveredViews = [
      ...new Set(
        input.images
          .map((i) => (i.view ?? '').toLowerCase().trim())
          .filter((v): v is string => Boolean(v)),
      ),
    ];

    const observations: RawObservation[] = [];
    // Corroborate scalar seller attributes at moderate confidence — clearly a mock, never a fact.
    for (const [field, raw] of Object.entries(input.attributes ?? {})) {
      if (raw == null || raw === '') continue;
      if (typeof raw === 'object') continue;
      observations.push({
        field,
        value: raw as string | number | boolean,
        confidence: 0.55,
        source: 'mock corroboration (no real vision model configured)',
      });
    }
    // A deterministic, image-only signal: more photos → a slightly firmer condition read.
    if (input.images.length > 0) {
      observations.push({
        field: 'photo_count',
        value: input.images.length,
        confidence: 0.9,
        source: 'counted uploaded photos',
      });
    }

    // Genuinely deterministic, model-free QC: flag duplicate uploads (same storageKey or url).
    const issues: CaptureIssue[] = [];
    const seen = new Set<string>();
    for (const img of input.images) {
      const key = img.storageKey ?? img.url ?? '';
      if (key && seen.has(key)) {
        issues.push({
          kind: 'duplicate',
          imageRef: key,
          message: 'This photo appears more than once.',
        });
      }
      if (key) seen.add(key);
    }

    return {
      categoryGuess: input.category
        ? {
            value: input.category,
            confidence: 0.5,
            source: 'seller-selected category (mock echoes it)',
          }
        : undefined,
      observations,
      issues,
      coveredViews,
    };
  }
}
