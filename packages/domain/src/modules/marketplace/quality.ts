/**
 * §6/§7 — deterministic, ADVISORY pre-publish quality-control assessment for a listing.
 *
 * This is the "AI-assisted quality-control gate": a derived record that scores how ready a listing
 * is to go live and surfaces concrete, fixable issues to the seller (pre-submit) and staff (at
 * review). It is authoritative about NOTHING (pack rule 2/3/11): it never mutates the listing, never
 * blocks a human decision, and every result carries `advisory: true`. The engine is deterministic
 * (no external model, no key), so it is FULLY_WORKING offline; a future model-backed pass can enrich
 * `checks` additively without changing this contract. Media-quality issue codes (blur/dark/glare/
 * duplicate), when supplied by the Vision image analyser, are folded in as warnings.
 */

export type QualitySeverity = 'info' | 'warn' | 'critical';
export type QualityStatus = 'ready' | 'needs_attention' | 'incomplete';

export interface QualityCheck {
  /** Stable machine key, e.g. "title", "photos", "required_attributes", "price". */
  key: string;
  severity: QualitySeverity;
  /** Short human label of what was checked. */
  label: string;
  /** Specific, actionable detail (what's wrong / what's good). */
  detail: string;
}

export interface ListingQualityInput {
  saleMethod: string;
  title?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  category: string;
  /** Required category attribute keys (from the category field schema). */
  requiredAttributeKeys?: string[];
  /** Attribute keys actually present (non-empty) on the asset. */
  presentAttributeKeys?: string[];
  photoCount: number;
  hasCover: boolean;
  videoAvailable?: boolean;
  guidePriceMinor?: number | null;
  buyNowPriceMinor?: number | null;
  quantityAvailable?: number | null;
  quantityUnitCode?: string | null;
  /** Commodity/bulk/scrap lots are divisible and a quantity+unit is expected. */
  isDivisible?: boolean;
  hasLocation?: boolean;
  /** Optional image-quality issue codes from the Vision analyser (blur|dark|glare|duplicate|…). */
  mediaIssues?: string[];
}

export interface ListingQualityAssessment {
  /** 0–100 readiness score (deterministic; penalties for missing/weak fields). */
  score: number;
  status: QualityStatus;
  checks: QualityCheck[];
  /** One-line human summary. */
  summary: string;
  /** Always true — this is a derived recommendation, never an authoritative gate. */
  advisory: true;
}

const PENALTY: Record<QualitySeverity, number> = { critical: 25, warn: 8, info: 0 };
const PRICED_SALE_METHODS = new Set(['BUY_NOW']);
const AUCTION_SALE_METHODS = new Set(['TIMED_AUCTION', 'LIVE_HYBRID']);

const nonEmpty = (s?: string | null): boolean => typeof s === 'string' && s.trim().length > 0;

/**
 * Score a listing's readiness from deterministic facts. Pure — same input always yields the same
 * assessment (so it is safe to recompute on demand and to record as a derived AiRun).
 */
export function assessListingQuality(input: ListingQualityInput): ListingQualityAssessment {
  const checks: QualityCheck[] = [];
  const add = (severity: QualitySeverity, key: string, label: string, detail: string) =>
    checks.push({ key, severity, label, detail });

  // Title.
  if (!nonEmpty(input.title) || input.title!.trim().length < 3) {
    add('critical', 'title', 'Title', 'Add a clear, descriptive title before publishing.');
  } else if (input.title!.trim().length < 12) {
    add(
      'warn',
      'title',
      'Title',
      'The title is very short — a fuller title lists and searches better.',
    );
  } else {
    add('info', 'title', 'Title', 'Title looks good.');
  }

  // Photos + cover.
  if (input.photoCount <= 0) {
    add(
      'critical',
      'photos',
      'Photos',
      'Add at least one photo — listings without photos rarely sell.',
    );
  } else if (input.photoCount < 3) {
    add(
      'warn',
      'photos',
      'Photos',
      `Only ${input.photoCount} photo(s) — 3+ from different angles build buyer trust.`,
    );
  } else {
    add('info', 'photos', 'Photos', `${input.photoCount} photos attached.`);
  }
  if (input.photoCount > 0 && !input.hasCover) {
    add(
      'warn',
      'cover',
      'Cover photo',
      'Choose a cover photo — it is what buyers see on the catalogue card.',
    );
  }

  // Description.
  if (!nonEmpty(input.fullDescription) && !nonEmpty(input.shortDescription)) {
    add(
      'warn',
      'description',
      'Description',
      'Add a description covering condition, history and defects.',
    );
  } else if (!nonEmpty(input.fullDescription)) {
    add(
      'info',
      'description',
      'Description',
      'A short description is present; a full description helps buyers decide.',
    );
  } else {
    add('info', 'description', 'Description', 'Description present.');
  }

  // Required category attributes.
  const required = input.requiredAttributeKeys ?? [];
  const present = new Set(input.presentAttributeKeys ?? []);
  const missing = required.filter((k) => !present.has(k));
  if (missing.length > 0) {
    add(
      'critical',
      'required_attributes',
      'Category details',
      `Missing required detail(s) for ${input.category}: ${missing.join(', ')}.`,
    );
  } else if (required.length > 0) {
    add(
      'info',
      'required_attributes',
      'Category details',
      'All required category details are filled in.',
    );
  }

  // Price expectations per sale method.
  if (PRICED_SALE_METHODS.has(input.saleMethod) && (input.buyNowPriceMinor ?? 0) <= 0) {
    add('critical', 'price', 'Price', 'A Buy Now listing needs a price before it can go live.');
  } else if (AUCTION_SALE_METHODS.has(input.saleMethod) && (input.guidePriceMinor ?? 0) <= 0) {
    add(
      'warn',
      'price',
      'Guide price',
      'No guide price set — a guide helps set bidder expectations (optional).',
    );
  }

  // Quantity + unit for divisible commodity lots.
  if (input.isDivisible) {
    if ((input.quantityAvailable ?? 0) <= 0 || !nonEmpty(input.quantityUnitCode)) {
      add(
        'warn',
        'quantity',
        'Quantity & unit',
        'Declare the quantity available and its unit (e.g. 40 MT) for a commodity lot.',
      );
    } else {
      add(
        'info',
        'quantity',
        'Quantity & unit',
        `${input.quantityAvailable} ${input.quantityUnitCode} declared.`,
      );
    }
  }

  // Location.
  if (input.hasLocation === false) {
    add(
      'warn',
      'location',
      'Location',
      'Add a city/region — buyers filter and plan collection by location.',
    );
  }

  // Media-quality issues surfaced by the Vision analyser (advisory).
  for (const issue of input.mediaIssues ?? []) {
    const label =
      issue === 'blur'
        ? 'A photo looks blurry'
        : issue === 'dark'
          ? 'A photo looks underexposed'
          : issue === 'glare'
            ? 'A photo has strong glare'
            : issue === 'duplicate'
              ? 'Two photos look near-identical'
              : `Photo issue: ${issue}`;
    add(
      issue === 'duplicate' ? 'info' : 'warn',
      `media_${issue}`,
      'Photo quality',
      `${label} — consider retaking it.`,
    );
  }

  const penalty = checks.reduce((sum, c) => sum + PENALTY[c.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const criticals = checks.filter((c) => c.severity === 'critical').length;
  const warns = checks.filter((c) => c.severity === 'warn').length;

  const status: QualityStatus =
    criticals > 0 ? 'incomplete' : warns > 0 || score < 80 ? 'needs_attention' : 'ready';

  const summary =
    criticals > 0
      ? `${criticals} item(s) must be fixed before this listing can go live.`
      : warns > 0
        ? `Ready to submit — ${warns} optional improvement(s) suggested.`
        : 'This listing looks ready to publish.';

  return { score, status, checks, summary, advisory: true };
}
