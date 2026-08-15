import { IllegalTransition, InvariantViolation } from '../../kernel/errors';

/**
 * Supply Programme engine (Evolution E10, pack doc 09 §Supply Programme + owner req 23). PURE logic
 * for a commodity supplier's recurring availability. The non-negotiable it guards: matching a
 * programme to buyer demand is a **recommendation only** — it never creates a binding award or
 * transaction (pack §09; consistent with DECISIONS D4). A programme can generate listings/offers,
 * but a human still confirms every deal.
 */

export const SUPPLY_PROGRAMME_STATUSES = [
  'draft',
  'active',
  'paused',
  'expired',
  'withdrawn',
] as const;
export type SupplyProgrammeStatus = (typeof SUPPLY_PROGRAMME_STATUSES)[number];

export const SUPPLY_PROGRAMME_TRANSITIONS: Record<SupplyProgrammeStatus, SupplyProgrammeStatus[]> =
  {
    draft: ['active', 'withdrawn'],
    active: ['paused', 'expired', 'withdrawn'],
    paused: ['active', 'expired', 'withdrawn'],
    expired: [],
    withdrawn: [],
  };

export function assertSupplyProgrammeTransition(
  from: SupplyProgrammeStatus,
  to: SupplyProgrammeStatus,
): void {
  if (!SUPPLY_PROGRAMME_TRANSITIONS[from]?.includes(to)) {
    throw new IllegalTransition(`Supply programme cannot move ${from} -> ${to}`);
  }
}

/**
 * Scale a non-negative decimal string to an exact integer at `dp` decimal places (default 9, the DB
 * `Decimal(38,9)` scale). Float-free (D5): parses the digits, never `parseFloat`.
 */
export function scaleDecimal(value: string, dp = 9): bigint {
  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    throw new InvariantViolation(`not a decimal: ${value}`);
  }
  const neg = value.startsWith('-');
  const [whole, frac = ''] = value.replace(/^-/, '').split('.');
  if (frac.length > dp) throw new InvariantViolation(`too many decimal places in ${value}`);
  const scaled = BigInt(whole + frac.padEnd(dp, '0'));
  return neg ? -scaled : scaled;
}

export interface SupplyProgrammeView {
  id: string;
  status: string;
  product: string;
  category: string | null;
  originCountry: string | null;
  /** Decimal strings (never a float). null = unspecified. */
  availableQuantity: string | null;
  minOrderQuantity: string | null;
  maxOrderQuantity: string | null;
  quantityUnitCode: string | null;
  indicativePriceMinor: bigint | null;
  leadTimeDays: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
}

/** Both quantities present ⟹ min ≤ max, and neither negative. */
export function assertOrderQuantities(minOrder: string | null, maxOrder: string | null): void {
  if (minOrder != null && scaleDecimal(minOrder) < 0n) {
    throw new InvariantViolation('minOrderQuantity cannot be negative');
  }
  if (maxOrder != null && scaleDecimal(maxOrder) < 0n) {
    throw new InvariantViolation('maxOrderQuantity cannot be negative');
  }
  if (minOrder != null && maxOrder != null && scaleDecimal(minOrder) > scaleDecimal(maxOrder)) {
    throw new InvariantViolation('minOrderQuantity cannot exceed maxOrderQuantity');
  }
}

/** A programme is offerable when it is active and `now` is within its validity window (open-ended
 *  when a bound is null). */
export function isSupplyProgrammeOfferable(p: SupplyProgrammeView, now: Date): boolean {
  if (p.status !== 'active') return false;
  if (p.validFrom && now < p.validFrom) return false;
  if (p.validUntil && now > p.validUntil) return false;
  return true;
}

export interface SupplyMatchCriteria {
  category?: string;
  product?: string;
  quantityRequired?: string;
  quantityUnitCode?: string;
  originCountry?: string;
}

export interface SupplyRecommendation {
  programmeId: string;
  product: string;
  originCountry: string | null;
  indicativePriceMinor: bigint | null;
  leadTimeDays: number | null;
}

/**
 * Recommend offerable programmes that could satisfy a demand — **advisory only** (pack §09 / D4).
 * Filters to offerable + matching programmes, then ranks cheapest indicative price first (nulls
 * last), then shortest lead time, then id. Creates NOTHING: the caller (a human buyer) decides.
 */
export function recommendProgrammes(
  programmes: readonly SupplyProgrammeView[],
  criteria: SupplyMatchCriteria,
  now: Date,
): SupplyRecommendation[] {
  const wantQty =
    criteria.quantityRequired != null ? scaleDecimal(criteria.quantityRequired) : null;
  const matches = programmes.filter((p) => {
    if (!isSupplyProgrammeOfferable(p, now)) return false;
    if (criteria.category && p.category !== criteria.category) return false;
    if (criteria.product && !p.product.toLowerCase().includes(criteria.product.toLowerCase())) {
      return false;
    }
    if (criteria.originCountry && p.originCountry !== criteria.originCountry) return false;
    if (criteria.quantityUnitCode && p.quantityUnitCode !== criteria.quantityUnitCode) return false;
    if (wantQty != null) {
      if (p.minOrderQuantity != null && wantQty < scaleDecimal(p.minOrderQuantity)) return false;
      if (p.availableQuantity != null && wantQty > scaleDecimal(p.availableQuantity)) return false;
    }
    return true;
  });
  return matches
    .slice()
    .sort((a, b) => {
      const ap = a.indicativePriceMinor;
      const bp = b.indicativePriceMinor;
      if (ap != null && bp != null && ap !== bp) return ap < bp ? -1 : 1;
      if (ap == null && bp != null) return 1;
      if (ap != null && bp == null) return -1;
      const al = a.leadTimeDays ?? Number.MAX_SAFE_INTEGER;
      const bl = b.leadTimeDays ?? Number.MAX_SAFE_INTEGER;
      if (al !== bl) return al - bl;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((p) => ({
      programmeId: p.id,
      product: p.product,
      originCountry: p.originCountry,
      indicativePriceMinor: p.indicativePriceMinor,
      leadTimeDays: p.leadTimeDays,
    }));
}
