import { type BuyerTwinSummary, type DiscoveryEventType } from '@singha/contracts';

/**
 * Buyer Twin — PURE, deterministic, rebuildable projection engine (pack docs 06/11).
 *
 * Tier-A: the ranking WEIGHTS and raw affinity scores are proprietary and never leave
 * the backend (pack doc 05/18). The projection is a REBUILDABLE read model — drop it
 * and recompute it from the durable DiscoveryEvent ledger + watch/bid/offer/EOI/
 * purchase history at any time; it is NEVER a source of truth and NEVER used for
 * credit/eligibility/access decisions. The engine consumes only safe, non-PII signal
 * fields (category, price, sale method) so it structurally cannot store sensitive
 * personal traits.
 */

/** Bump when the projection's feature schema changes so stale projections rebuild. */
export const BUYER_TWIN_VERSION = 1;

/** A single learning signal derived from a durable event/profile row. No PII. */
export interface DiscoverySignal {
  type: DiscoveryEventType;
  category: string;
  priceMinor?: number | null;
  saleMethod?: string | null;
}

/**
 * Signal weights (Tier-A). Explicit intent (purchase/bid/offer/EOI/watch/like)
 * dominates passive behaviour (open/impression), so a single accidental impression
 * never overfits; explicit negatives subtract.
 */
const WEIGHTS: Record<DiscoveryEventType, number> = {
  PURCHASE: 6,
  BID: 5,
  OFFER: 5,
  EOI: 4,
  WATCH: 3,
  LIKE: 3,
  SHARE: 2,
  BID_INTENT: 2,
  OPEN: 1,
  IMPRESSION: 0.25,
  UNWATCH: -2,
  DISLIKE: -3,
};

/** Total positive weight at which confidence saturates to 1.0. */
const CONFIDENCE_SATURATION = 24;

export interface CategoryAffinity {
  category: string;
  score: number;
}

/** Internal (Tier-A) projection — carries raw scores; never serialised to a client. */
export interface BuyerTwinProjection {
  version: number;
  categoryAffinities: CategoryAffinity[];
  dislikedCategories: string[];
  priceBandMinor: { min: number; max: number } | null;
  saleMethodPreference: string | null;
  confidence: number;
  builtAt: string;
  signalCount: number;
}

/**
 * Rebuild the projection from a set of signals. Deterministic: the same signals (and
 * `now`) always produce the identical projection, so a rebuild is verifiable.
 */
export function buildBuyerTwinProjection(
  signals: readonly DiscoverySignal[],
  now: Date = new Date(),
): BuyerTwinProjection {
  const catScore = new Map<string, number>();
  const methodScore = new Map<string, number>();
  const positivePrices: number[] = [];
  let positiveWeight = 0;

  for (const s of signals) {
    const w = WEIGHTS[s.type] ?? 0;
    catScore.set(s.category, (catScore.get(s.category) ?? 0) + w);
    if (w > 0) {
      positiveWeight += w;
      if (s.saleMethod) methodScore.set(s.saleMethod, (methodScore.get(s.saleMethod) ?? 0) + w);
      if (s.priceMinor != null && s.priceMinor > 0) positivePrices.push(s.priceMinor);
    }
  }

  const categoryAffinities = [...catScore.entries()]
    .filter(([, score]) => score > 0)
    .map(([category, score]) => ({ category, score }))
    // Deterministic: score desc, then category asc as a stable tiebreak.
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));

  const dislikedCategories = [...catScore.entries()]
    .filter(([, score]) => score < 0)
    .map(([category]) => category)
    .sort();

  const saleMethodPreference =
    [...methodScore.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    null;

  const priceBandMinor = positivePrices.length
    ? { min: Math.min(...positivePrices), max: Math.max(...positivePrices) }
    : null;

  return {
    version: BUYER_TWIN_VERSION,
    categoryAffinities,
    dislikedCategories,
    priceBandMinor,
    saleMethodPreference,
    confidence: Math.min(1, positiveWeight / CONFIDENCE_SATURATION),
    builtAt: now.toISOString(),
    signalCount: signals.length,
  };
}

/** An empty projection — used as the reset / no-signal fallback. */
export function emptyBuyerTwinProjection(now: Date = new Date()): BuyerTwinProjection {
  return buildBuyerTwinProjection([], now);
}

/**
 * Explainable reason labels derived from SAFE projection fields only (pack doc 11).
 * Never exposes scores, weights or internal confidence values.
 */
export function explanationLabels(p: BuyerTwinProjection): string[] {
  const out: string[] = [];
  const top = p.categoryAffinities[0]?.category;
  if (top) out.push(`Because you follow ${top}`);
  if (p.priceBandMinor) out.push('Matches your usual price range');
  if (p.saleMethodPreference) {
    out.push(
      `More ${p.saleMethodPreference.toLowerCase().replace(/_/g, ' ')} lots like ones you engage with`,
    );
  }
  out.push('Ending soon in categories you follow');
  return out;
}

function bucketConfidence(c: number): BuyerTwinSummary['confidence'] {
  if (c <= 0) return 'none';
  if (c < 0.34) return 'low';
  if (c < 0.67) return 'medium';
  return 'high';
}

/** Map the internal (Tier-A) projection to the safe, client-facing summary. */
export function toBuyerTwinSummary(p: BuyerTwinProjection): BuyerTwinSummary {
  return {
    version: p.version,
    topCategories: p.categoryAffinities.slice(0, 5).map((a) => a.category),
    dislikedCategories: p.dislikedCategories,
    priceBandMinor: p.priceBandMinor,
    preferredSaleMethod: p.saleMethodPreference,
    confidence: bucketConfidence(p.confidence),
    explanations: p.confidence > 0 ? explanationLabels(p) : [],
    builtAt: p.signalCount > 0 ? p.builtAt : null,
  };
}
