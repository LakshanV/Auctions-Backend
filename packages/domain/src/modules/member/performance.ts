/**
 * Member performance rule engine (Revision 05 §18/§10) — PURE, deterministic,
 * versioned, explainable, rebuildable. This is NOT an opaque AI score: given the
 * same objective events and the same rule version it always yields the same result,
 * with a component breakdown and reason codes. AI may summarize the output; it can
 * never produce or alter the score (§25).
 */

export type PerformanceContext = 'buyer' | 'seller';

export type PerformanceBand = 'INSUFFICIENT_HISTORY' | 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';

/** An objective, recorded event that contributes to a performance dimension. */
export interface PerformanceEventInput {
  /** e.g. 'PAYMENT_ON_TIME', 'PAYMENT_LATE', 'UNPAID_DEFAULT', 'DISPUTE_LOST'. */
  eventType: string;
  /** Dimension this event scores against, e.g. 'paymentReliability'. */
  dimension: string;
  /** Objective magnitude (e.g. count = 1, or a weighted value). */
  value: number;
}

export interface DimensionRule {
  key: string;
  label: string;
  /** Relative weight of this dimension in the overall 0–100 score. */
  weight: number;
  /** Per-eventType delta applied to this dimension's 0–100 sub-score. */
  deltas: Record<string, number>;
  /** Starting sub-score before events (neutral baseline). */
  baseline: number;
}

export interface PerformanceRuleset {
  version: string;
  context: PerformanceContext;
  /** Minimum total scored events required before a score is emitted at all. */
  minEvents: number;
  dimensions: DimensionRule[];
}

export interface DimensionScore {
  key: string;
  label: string;
  weight: number;
  score: number;
  eventCount: number;
}

export interface PerformanceSnapshotResult {
  context: PerformanceContext;
  ruleVersion: string;
  band: PerformanceBand;
  /** null when INSUFFICIENT_HISTORY — we never fabricate a score from no history. */
  score: number | null;
  dimensions: DimensionScore[];
  eventCount: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function bandFor(score: number): PerformanceBand {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'FAIR';
  return 'POOR';
}

/**
 * Deterministically compute a performance snapshot. Events are folded in a stable
 * order-independent way (sum of deltas), so a rebuild from the immutable event log
 * reproduces the exact same score for a given rule version (§18 "rebuildable").
 */
export function computePerformanceSnapshot(
  ruleset: PerformanceRuleset,
  events: readonly PerformanceEventInput[],
): PerformanceSnapshotResult {
  const scored = events.filter((e) =>
    ruleset.dimensions.some((d) => d.key === e.dimension && e.eventType in d.deltas),
  );

  if (scored.length < ruleset.minEvents) {
    return {
      context: ruleset.context,
      ruleVersion: ruleset.version,
      band: 'INSUFFICIENT_HISTORY',
      score: null,
      dimensions: ruleset.dimensions.map((d) => ({
        key: d.key,
        label: d.label,
        weight: d.weight,
        score: d.baseline,
        eventCount: 0,
      })),
      eventCount: scored.length,
    };
  }

  const dimensions: DimensionScore[] = ruleset.dimensions.map((d) => {
    const dEvents = scored.filter((e) => e.dimension === d.key);
    const delta = dEvents.reduce(
      (sum, e) => sum + (d.deltas[e.eventType] ?? 0) * (e.value === 0 ? 0 : e.value),
      0,
    );
    return {
      key: d.key,
      label: d.label,
      weight: d.weight,
      score: clamp(d.baseline + delta, 0, 100),
      eventCount: dEvents.length,
    };
  });

  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0) || 1;
  const weighted = dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight;
  const score = Math.round(clamp(weighted, 0, 100));

  return {
    context: ruleset.context,
    ruleVersion: ruleset.version,
    band: bandFor(score),
    score,
    dimensions,
    eventCount: scored.length,
  };
}

/** Reference buyer ruleset v1 (weights/thresholds are configuration — §10). */
export const BUYER_RULESET_V1: PerformanceRuleset = {
  version: 'buyer-v1',
  context: 'buyer',
  minEvents: 3,
  dimensions: [
    {
      key: 'paymentReliability',
      label: 'Payment reliability',
      weight: 40,
      baseline: 80,
      deltas: { PAYMENT_ON_TIME: 4, PAYMENT_LATE: -8, UNPAID_DEFAULT: -30, CHARGEBACK: -25 },
    },
    {
      key: 'settlementCompletion',
      label: 'Settlement completion',
      weight: 25,
      baseline: 80,
      deltas: { PURCHASE_COMPLETED: 3, BUYER_CANCELLED: -12, BID_WITHOUT_SETTLEMENT: -10 },
    },
    {
      key: 'collection',
      label: 'Collection / fulfilment',
      weight: 20,
      baseline: 85,
      deltas: { COLLECTED_ON_TIME: 3, NO_SHOW: -15 },
    },
    {
      key: 'disputeConduct',
      label: 'Dispute conduct',
      weight: 15,
      baseline: 85,
      deltas: { DISPUTE_RESOLVED_OK: 2, DISPUTE_LOST: -20 },
    },
  ],
};

/** Reference seller ruleset v1. */
export const SELLER_RULESET_V1: PerformanceRuleset = {
  version: 'seller-v1',
  context: 'seller',
  minEvents: 3,
  dimensions: [
    {
      key: 'listingAccuracy',
      label: 'Listing accuracy',
      weight: 35,
      baseline: 80,
      deltas: { ACCURATE_LISTING: 3, CONDITION_ISSUE: -12, DESCRIPTION_DISPUTE: -18 },
    },
    {
      key: 'documentation',
      label: 'Documentation',
      weight: 20,
      baseline: 80,
      deltas: { DOCS_COMPLETE: 3, DOCS_MISSING: -12 },
    },
    {
      key: 'availability',
      label: 'Asset availability',
      weight: 20,
      baseline: 85,
      deltas: { ASSET_AVAILABLE: 2, ASSET_UNAVAILABLE: -20 },
    },
    {
      key: 'fulfilment',
      label: 'Release / fulfilment',
      weight: 25,
      baseline: 85,
      deltas: { RELEASE_COOPERATIVE: 3, SELLER_CANCELLED: -18, RELEASE_OBSTRUCTED: -15 },
    },
  ],
};

export function rulesetForContext(context: PerformanceContext): PerformanceRuleset {
  return context === 'buyer' ? BUYER_RULESET_V1 : SELLER_RULESET_V1;
}
