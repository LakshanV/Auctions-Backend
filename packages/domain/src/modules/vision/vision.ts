import type {
  CaptureRequirement,
  CategoryKey,
  VisionFieldState,
  VisionFieldSuggestion,
  VisionValuation,
} from '@singha/contracts';

/**
 * RW2 — Photo-first AI seller intake, PURE domain kernel (docs/10 "Customer AI"; OSS engine
 * choices in SINGHA_OSS_DECISIONS.md). No Nest, no Prisma, no provider — just the deterministic
 * rules that turn raw vision observations into an ADVISORY listing draft with honest provenance.
 *
 * Two jobs, both Tier-A and testable in isolation:
 *   1. Capture coaching — which photos each category needs, and which are still missing.
 *   2. Field finalisation — map a provider's raw observations to suggestions whose STATE never
 *      hides uncertainty, and flag any observation that contradicts the seller's own claim.
 *
 * Nothing here is authoritative: the output is a derived draft (rule 3), never an asset fact,
 * never a binding action (rule 11). Valuation is evidence-based (from Singha comparables), never
 * an AI-invented number (directive §14).
 */

/** A capture requirement before it is checked against what the seller actually uploaded. */
export interface CaptureRequirementSpec {
  view: string;
  label: string;
  required: boolean;
  guidance: string;
}

/**
 * Category-specific capture plans (directive §12 "category-specific vision pipelines"). Required
 * views are the evidence a credible listing/valuation depends on (identity plate, meter reading,
 * certificate); optional views improve the draft but never block it. `general` is the safe
 * fallback for an unknown or mixed lot.
 */
export const CAPTURE_REQUIREMENTS: Record<CategoryKey, CaptureRequirementSpec[]> = {
  vehicles: [
    {
      view: 'front_quarter',
      label: 'Front 3/4',
      required: true,
      guidance: 'Whole car at an angle, good light, no glare.',
    },
    {
      view: 'rear_quarter',
      label: 'Rear 3/4',
      required: true,
      guidance: 'Opposite corner so both sides are seen.',
    },
    {
      view: 'odometer',
      label: 'Odometer',
      required: true,
      guidance: 'Dashboard with the mileage/odometer readable.',
    },
    {
      view: 'vin_plate',
      label: 'VIN / chassis plate',
      required: true,
      guidance: 'Sharp close-up of the VIN/chassis number.',
    },
    {
      view: 'interior',
      label: 'Interior',
      required: false,
      guidance: 'Seats and dashboard from the driver door.',
    },
    {
      view: 'engine_bay',
      label: 'Engine bay',
      required: false,
      guidance: 'Bonnet up, whole engine bay.',
    },
    {
      view: 'damage',
      label: 'Any damage',
      required: false,
      guidance: 'Close-up of any dent, rust or scratch — be honest.',
    },
  ],
  machinery: [
    {
      view: 'full_unit',
      label: 'Full machine',
      required: true,
      guidance: 'Whole machine in frame, side on.',
    },
    {
      view: 'serial_plate',
      label: 'Serial / data plate',
      required: true,
      guidance: 'Sharp close-up of the maker/serial plate.',
    },
    {
      view: 'hour_meter',
      label: 'Hour meter',
      required: true,
      guidance: 'Instrument panel with running hours readable.',
    },
    {
      view: 'operator_station',
      label: 'Operator station',
      required: false,
      guidance: 'Cab / controls.',
    },
    {
      view: 'attachments',
      label: 'Attachments',
      required: false,
      guidance: 'Bucket, forks or tooling included in the sale.',
    },
    {
      view: 'wear',
      label: 'Wear points',
      required: false,
      guidance: 'Tracks/tyres, cutting edges, leaks — be honest.',
    },
  ],
  gems: [
    {
      view: 'face_up',
      label: 'Face up',
      required: true,
      guidance: 'Top view on a neutral background, diffuse light.',
    },
    {
      view: 'scale',
      label: 'With scale',
      required: true,
      guidance: 'Beside a ruler or on a carat scale for size.',
    },
    {
      view: 'certificate',
      label: 'Certificate',
      required: true,
      guidance: 'The lab certificate/report if the stone is certified.',
    },
    {
      view: 'profile',
      label: 'Side profile',
      required: false,
      guidance: 'Side view to show depth and cut.',
    },
    {
      view: 'inclusions',
      label: 'Inclusions',
      required: false,
      guidance: 'Loupe/macro of any inclusions — be honest.',
    },
  ],
  property: [
    {
      view: 'exterior',
      label: 'Exterior / facade',
      required: true,
      guidance: 'The building or land from the road.',
    },
    {
      view: 'plot',
      label: 'Plot / aerial',
      required: true,
      guidance: 'Boundary or aerial showing the extent.',
    },
    {
      view: 'frontage',
      label: 'Road frontage',
      required: false,
      guidance: 'The access road and frontage width.',
    },
    {
      view: 'interior',
      label: 'Interior',
      required: false,
      guidance: 'Main rooms if it is a building.',
    },
    {
      view: 'deed_plan',
      label: 'Deed / survey plan',
      required: false,
      guidance: 'Survey plan or deed page if available.',
    },
  ],
  bulk: [
    {
      view: 'lot',
      label: 'Whole lot',
      required: true,
      guidance: 'The full pallet/consignment in one frame.',
    },
    {
      view: 'closeup',
      label: 'Quality close-up',
      required: true,
      guidance: 'Close-up showing grade, freshness or condition.',
    },
    {
      view: 'label',
      label: 'Label / grade',
      required: true,
      guidance: 'Packaging label, grade stamp or batch mark.',
    },
    {
      view: 'quantity_ref',
      label: 'Quantity reference',
      required: false,
      guidance: 'A scale or count reference for quantity.',
    },
  ],
  general: [
    {
      view: 'main',
      label: 'Main photo',
      required: true,
      guidance: 'The whole item, well lit, filling the frame.',
    },
    {
      view: 'detail',
      label: 'Detail',
      required: false,
      guidance: 'A close-up of the most important feature.',
    },
    {
      view: 'markings',
      label: 'Label / markings',
      required: false,
      guidance: 'Any brand, model or serial markings.',
    },
    {
      view: 'defects',
      label: 'Any defects',
      required: false,
      guidance: 'Honest close-up of wear or damage.',
    },
  ],
};

/**
 * Capture coach: given the views the seller's photos cover, return every requirement with a
 * `present` flag. The caller turns unmet REQUIRED entries into "still need a photo of …" prompts.
 * Matching is view-key based (the provider/UI tags each upload with a `view` hint); an untagged
 * upload simply doesn't satisfy a specific requirement, which is the safe default.
 */
export function buildCaptureCoach(
  category: CategoryKey,
  coveredViews: readonly string[],
): CaptureRequirement[] {
  const covered = new Set(coveredViews.map((v) => v.toLowerCase().trim()).filter(Boolean));
  const specs = CAPTURE_REQUIREMENTS[category] ?? CAPTURE_REQUIREMENTS.general;
  return specs.map((s) => ({
    view: s.view,
    label: s.label,
    required: s.required,
    present: covered.has(s.view),
    guidance: s.guidance,
  }));
}

/** True while a required capture view is still missing — the seller can proceed manually, but the
 *  draft/valuation is flagged low-evidence until this is false. */
export function hasUnmetRequiredCaptures(coach: readonly CaptureRequirement[]): boolean {
  return coach.some((c) => c.required && !c.present);
}

/**
 * Confidence → observation state. Uncertainty is NEVER upgraded to a confident claim: a field the
 * photos could not establish is `not_visible`, and a weak signal is `uncertain`, not `observed`.
 * Thresholds are deliberately conservative — a wrong "observed" is worse than an honest "probable".
 */
export function deriveFieldState(
  confidence: number,
  value: VisionFieldSuggestion['value'],
): VisionFieldState {
  if (value === null || value === undefined || value === '' || confidence <= 0)
    return 'not_visible';
  if (confidence >= 0.85) return 'observed';
  if (confidence >= 0.6) return 'probable';
  return 'uncertain';
}

/** A raw observation from a vision provider, before the domain assigns state / reconciles claims. */
export interface RawObservation {
  field: string;
  value: string | number | boolean | null;
  confidence: number;
  source: string;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Loose equality for reconciling a seller claim against an observation (case/space-insensitive
 *  for strings, numeric-tolerant otherwise). */
function claimsAgree(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * Finalise raw provider observations into advisory suggestions:
 *   - clamp confidence to 0..1 and assign an honest {@link VisionFieldState};
 *   - deduplicate by field, keeping the highest-confidence observation;
 *   - reconcile against the seller's own claims — where a confident observation DISAGREES with a
 *     seller-supplied attribute, the field is marked `contradicted` (surfaced, never silently
 *     overwritten in either direction) so a human resolves it. This is an honesty/anti-fraud
 *     signal, not a decision: nothing is auto-accepted.
 *
 * Deterministic and side-effect free — the same observations always yield the same suggestions.
 */
export function finalizeFields(
  observations: readonly RawObservation[],
  sellerClaims: Record<string, unknown> = {},
): VisionFieldSuggestion[] {
  const best = new Map<string, RawObservation>();
  for (const o of observations) {
    const prev = best.get(o.field);
    if (!prev || clamp01(o.confidence) > clamp01(prev.confidence)) best.set(o.field, o);
  }

  return [...best.values()]
    .map((o) => {
      const confidence = clamp01(o.confidence);
      let state = deriveFieldState(confidence, o.value);
      let source = o.source;
      const claim = sellerClaims[o.field];
      // Only a claim we can actually see is worth reconciling; a `not_visible` field can't contradict.
      if (
        claim !== undefined &&
        state !== 'not_visible' &&
        o.value !== null &&
        !claimsAgree(claim, o.value)
      ) {
        state = 'contradicted';
        source = `${o.source} — differs from seller-stated "${String(claim)}"; needs review`;
      }
      return { field: o.field, value: o.value, confidence, source, state };
    })
    .sort((a, b) => a.field.localeCompare(b.field));
}

/**
 * Build an evidence-based valuation from Singha comparables (directive §14 — never an AI-invented
 * number). The band comes straight from the comparable-sales range; confidence scales with how
 * many comparables backed it and drops when required capture evidence is still missing. Returns
 * null when there are no comparables — the seller then prices manually rather than being shown a
 * fabricated figure.
 */
export function toVisionValuation(input: {
  currency: string;
  range: { minMinor: number; medianMinor: number; maxMinor: number } | null;
  comparableCount: number;
  comparableRefs: string[];
  factors: string[];
  evidenceComplete: boolean;
  assessedAt: string;
}): VisionValuation | undefined {
  if (!input.range || input.comparableCount === 0) return undefined;
  // More comparables → more confidence, capped; thin/one-off evidence stays modest.
  let confidence = clamp01(0.35 + Math.min(input.comparableCount, 8) * 0.06);
  const factors = [...input.factors];
  if (!input.evidenceComplete) {
    confidence = clamp01(confidence - 0.15);
    factors.push('required photos incomplete — valuation is indicative only');
  }
  factors.push(`based on ${input.comparableCount} comparable sale(s)`);
  return {
    currency: input.currency,
    lowMinor: input.range.minMinor,
    expectedMinor: input.range.medianMinor,
    highMinor: input.range.maxMinor,
    confidence,
    comparableRefs: input.comparableRefs,
    factors,
    assessedAt: input.assessedAt,
  };
}
