import { comparableHeadlineMinor } from '../exchange/offer-revision';
import { scaleDecimal } from '../supply/supply-programme';

/**
 * Singha Intelligence engine (Evolution E12, pack doc 12 §AI). PURE, DETERMINISTIC intelligence:
 * matching, offer/pricing comparison and risk scoring. Every function returns a **derived,
 * non-binding recommendation** — no LLM, no float, and nothing here binds a transaction or mutates a
 * fact (rule 3, rule 11, doc 12: "deterministic code, not LLM, controls money/eligibility/state").
 */

/* ---------------- Matching (buyer↔supply / supplier↔demand) ---------------- */

export interface MatchCandidate {
  id: string;
  category: string | null;
  product: string;
  originCountry: string | null;
  availableQuantity: string | null;
  minOrderQuantity: string | null;
  quantityUnitCode: string | null;
  indicativePriceMinor: bigint | null;
}

export interface MatchCriteria {
  category?: string;
  product?: string;
  quantityRequired?: string;
  quantityUnitCode?: string;
  originCountry?: string;
}

export interface MatchResult {
  candidateId: string;
  score: number;
  factors: string[];
  indicativePriceMinor: bigint | null;
}

/**
 * Score a candidate against the criteria, or null when it fails a hard filter (a *specified*
 * category / origin / unit / quantity constraint it does not satisfy). Score is the sum of matched
 * component weights (max 100) with an explainable factor list.
 */
export function scoreMatch(criteria: MatchCriteria, candidate: MatchCandidate): MatchResult | null {
  const factors: string[] = [];
  let score = 0;

  if (criteria.category) {
    if (candidate.category !== criteria.category) return null;
    score += 30;
    factors.push('category:exact');
  }
  if (criteria.originCountry) {
    if (candidate.originCountry !== criteria.originCountry) return null;
    score += 15;
    factors.push('origin:exact');
  }
  if (criteria.quantityUnitCode) {
    if (candidate.quantityUnitCode !== criteria.quantityUnitCode) return null;
    factors.push('unit:exact');
  }
  if (criteria.quantityRequired != null) {
    const want = scaleDecimal(criteria.quantityRequired);
    if (candidate.minOrderQuantity != null && want < scaleDecimal(candidate.minOrderQuantity)) {
      return null;
    }
    if (candidate.availableQuantity != null && want > scaleDecimal(candidate.availableQuantity)) {
      return null;
    }
    score += 20;
    factors.push('quantity:in_range');
  }
  if (criteria.product) {
    if (candidate.product.toLowerCase().includes(criteria.product.toLowerCase())) {
      score += 25;
      factors.push('product:match');
    }
  }
  if (candidate.indicativePriceMinor != null) {
    score += 10;
    factors.push('price:known');
  }
  return {
    candidateId: candidate.id,
    score,
    factors,
    indicativePriceMinor: candidate.indicativePriceMinor,
  };
}

/** Rank candidates best-fit first (score desc), then cheapest, then id. Advisory only. */
export function rankMatches(
  criteria: MatchCriteria,
  candidates: readonly MatchCandidate[],
): MatchResult[] {
  return candidates
    .map((c) => scoreMatch(criteria, c))
    .filter((r): r is MatchResult => r !== null)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const ap = a.indicativePriceMinor;
      const bp = b.indicativePriceMinor;
      if (ap != null && bp != null && ap !== bp) return ap < bp ? -1 : 1;
      if (ap == null && bp != null) return 1;
      if (ap != null && bp == null) return -1;
      return a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0;
    });
}

/* ---------------- Offer Intelligence (compare complete proposals) ---------------- */

export interface ProposalForComparison {
  id: string;
  totalPriceMinor: bigint | null;
  unitPriceMinor: bigint | null;
  quantity: string | null;
  deliveryDays: number | null;
  incoterm: string | null;
}

/** Compare complete proposals on a normalized headline + delivery. Ranking is advisory (binding:
 *  false) — the engine never selects a winner (D4). */
export function compareProposals(proposals: readonly ProposalForComparison[]) {
  const rows = proposals.map((p) => ({
    id: p.id,
    headlineMinor: comparableHeadlineMinor({
      totalPriceMinor: p.totalPriceMinor,
      unitPriceMinor: p.unitPriceMinor,
      quantity: p.quantity,
    }),
    deliveryDays: p.deliveryDays,
    incoterm: p.incoterm,
  }));
  const ranked = rows.slice().sort((a, b) => {
    const ah = a.headlineMinor;
    const bh = b.headlineMinor;
    if (ah != null && bh != null && ah !== bh) return ah < bh ? -1 : 1;
    if (ah == null && bh != null) return 1;
    if (ah != null && bh == null) return -1;
    const ad = a.deliveryDays ?? Number.MAX_SAFE_INTEGER;
    const bd = b.deliveryDays ?? Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const priced = ranked.filter((r) => r.headlineMinor != null);
  const withDelivery = rows.filter((r) => r.deliveryDays != null);
  const fastest = withDelivery
    .slice()
    .sort((a, b) => (a.deliveryDays ?? 0) - (b.deliveryDays ?? 0));
  return {
    binding: false as const,
    ranked,
    cheapestId: priced[0]?.id ?? null,
    fastestId: fastest[0]?.id ?? null,
  };
}

/* ---------------- Pricing Intelligence (comparables) ---------------- */

export interface PriceComparables {
  count: number;
  minMinor: bigint | null;
  medianMinor: bigint | null;
  maxMinor: bigint | null;
  spreadMinor: bigint | null;
}

/** Exact integer comparables over observed prices (minor units). Median uses integer division for
 *  even counts — float-free (D5/D6). */
export function priceComparables(prices: readonly bigint[]): PriceComparables {
  if (prices.length === 0) {
    return { count: 0, minMinor: null, medianMinor: null, maxMinor: null, spreadMinor: null };
  }
  const sorted = prices.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = sorted.length;
  const at = (i: number): bigint => {
    const v = sorted[i];
    if (v === undefined) throw new Error('price index out of range');
    return v;
  };
  const min = at(0);
  const max = at(n - 1);
  const median = n % 2 === 1 ? at((n - 1) / 2) : (at(n / 2 - 1) + at(n / 2)) / 2n;
  return { count: n, minMinor: min, medianMinor: median, maxMinor: max, spreadMinor: max - min };
}

/* ---------------- Fraud / Risk review signals ---------------- */

export interface RiskSignals {
  accountAgeDays: number;
  unverifiedHighValue?: boolean;
  rapidActions?: number;
  mismatchedCountry?: boolean;
  chargebackHistory?: boolean;
}

export type RiskBand = 'low' | 'medium' | 'high';

/**
 * Deterministic risk review — a **signal**, never an automatic block (doc 12: fraud/risk produces
 * review signals; enforcement stays a human/operator decision). Returns a score, band and the
 * explainable flags that fired.
 */
export function assessRisk(s: RiskSignals): { score: number; band: RiskBand; flags: string[] } {
  const flags: string[] = [];
  let score = 0;
  if (s.accountAgeDays < 7) {
    score += 25;
    flags.push('new_account');
  }
  if (s.unverifiedHighValue) {
    score += 35;
    flags.push('unverified_high_value');
  }
  if ((s.rapidActions ?? 0) > 20) {
    score += 20;
    flags.push('rapid_actions');
  }
  if (s.mismatchedCountry) {
    score += 15;
    flags.push('country_mismatch');
  }
  if (s.chargebackHistory) {
    score += 30;
    flags.push('chargeback_history');
  }
  const band: RiskBand = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { score, band, flags };
}
