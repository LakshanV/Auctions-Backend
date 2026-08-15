import { IllegalTransition } from '../../kernel/errors';

/**
 * Commercial Offer Engine V2 (pack doc 08) — proposal revisions + sealed-offer confidentiality
 * and selection. Pure logic (no DB): the API persists immutable `OfferRevision`s and creates the
 * `Sale` under a row lock; this module owns the rules so they are exhaustively testable and can't
 * drift. The non-negotiable it guards is DECISIONS **D4**: a sealed offer's highest proposal is
 * NEVER auto-awarded — a winner requires either an explicit manual selection or an
 * explicitly-configured `AUTO_HIGHEST` policy, and only after a controlled reveal.
 */

export const OFFER_AWARD_POLICIES = ['MANUAL_SELECTION', 'AUTO_HIGHEST'] as const;
export type OfferAwardPolicy = (typeof OFFER_AWARD_POLICIES)[number];

/** New sealed/offer events default to manual selection — the highest never auto-binds (D4). */
export function defaultAwardPolicy(): OfferAwardPolicy {
  return 'MANUAL_SELECTION';
}

export const OFFER_AUTHOR_TYPES = ['buyer', 'seller', 'operator'] as const;
export type OfferAuthorType = (typeof OFFER_AUTHOR_TYPES)[number];

/** Next immutable revision number (1-based). Revisions are append-only — prior terms are never
 *  overwritten; a counter creates a new revision. */
export function nextRevisionNumber(existing: readonly { revisionNumber: number }[]): number {
  return existing.reduce((max, r) => Math.max(max, r.revisionNumber), 0) + 1;
}

/** A counter is authored by the seller/operator side (vs the buyer's original proposal). */
export function isCounterAuthor(author: OfferAuthorType): boolean {
  return author === 'seller' || author === 'operator';
}

/* ---------------- Binding total (money-critical, float-free) ---------------- */

/** Quantity is Decimal(38,9); we scale by 10^9 and do all math in integer bigint. */
const QTY_SCALE_FACTOR = 1_000_000_000n; // 10^9

/**
 * Parse a decimal quantity string (integer or up to 9 decimal places) to a scaled
 * integer (value × 10^9). Never uses floating point — DECISIONS D5. Throws on any
 * malformed input so a bad quantity can never silently corrupt a binding total.
 */
export function parseQuantityToScaled(q: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,9}))?$/.exec(q.trim());
  if (!m) throw new IllegalTransition(`invalid quantity: "${q}"`);
  const [, signGroup, wholeGroup, fracGroup] = m;
  const sign = signGroup === '-' ? -1n : 1n;
  const whole = BigInt(wholeGroup ?? '0');
  const frac = fracGroup ? BigInt(fracGroup.padEnd(9, '0')) : 0n;
  return sign * (whole * QTY_SCALE_FACTOR + frac);
}

/**
 * The single binding total (integer minor units) a revision commits to when it is
 * accepted/awarded. Prefers an explicit `totalPriceMinor`; otherwise derives
 * `unitPriceMinor × quantity` — but ONLY when that product is an exact whole number
 * of minor units. A non-exact product throws: any rounding policy is deferred to the
 * fees/rounding engine (E8), never invented here. Returns a bigint, never a fraction,
 * never a float (DECISIONS D5).
 */
export function bindingTotalMinor(rev: {
  totalPriceMinor: bigint | null;
  unitPriceMinor: bigint | null;
  quantity: string | null;
}): bigint {
  if (rev.totalPriceMinor != null) return rev.totalPriceMinor;
  if (rev.unitPriceMinor != null && rev.quantity != null) {
    const scaledQty = parseQuantityToScaled(rev.quantity);
    if (scaledQty <= 0n) {
      throw new IllegalTransition('quantity must be positive to derive a binding total');
    }
    const scaledTotal = rev.unitPriceMinor * scaledQty; // still scaled by 10^9
    if (scaledTotal % QTY_SCALE_FACTOR !== 0n) {
      throw new IllegalTransition(
        'unit price × quantity is not an exact number of minor units — agree an explicit total ' +
          '(rounding is deferred to the fees/rounding engine, E8)',
      );
    }
    return scaledTotal / QTY_SCALE_FACTOR;
  }
  throw new IllegalTransition('offer revision carries no binding price');
}

/** The comparable headline for ranking a sealed proposal, or null if none can be derived. */
export function comparableHeadlineMinor(rev: {
  totalPriceMinor: bigint | null;
  unitPriceMinor: bigint | null;
  quantity: string | null;
}): bigint | null {
  try {
    return bindingTotalMinor(rev);
  } catch {
    return null;
  }
}

/* ---------------- Sealed-offer confidentiality ---------------- */

export interface SealedOffer {
  id: string;
  /** Comparable headline value of the current revision (null = no priced proposal yet). */
  totalPriceMinor: bigint | null;
  /** Offer lifecycle status, e.g. 'open' | 'countered' | 'withdrawn'. */
  status: string;
}

export type SealedViewerRole = 'buyer' | 'seller' | 'operator' | 'admin' | 'auditor';

/** Who may reveal / see ranked sealed proposals. Buyers never can (pack doc 20). */
export function canRevealSealedOffers(role: SealedViewerRole): boolean {
  return role === 'seller' || role === 'operator' || role === 'admin';
}

const isLive = (o: SealedOffer) => o.status !== 'withdrawn';
const isPriced = (o: SealedOffer) => o.totalPriceMinor != null && isLive(o);

/**
 * Public participation view for a sealed event — COUNTS ONLY, never amounts or identities. This
 * is all any participant (or the public) may see before the reveal (pack doc 20:
 * "12 verified buyers participating, 6 offers received").
 */
export function sealedParticipationView(offers: readonly SealedOffer[]): {
  participants: number;
  offersReceived: number;
} {
  return {
    participants: offers.filter(isLive).length,
    offersReceived: offers.filter(isPriced).length,
  };
}

/** Highest-first ordering by headline price (exact bigint compare, no float). */
function byPriceDesc(a: SealedOffer, b: SealedOffer): number {
  const av = a.totalPriceMinor ?? 0n;
  const bv = b.totalPriceMinor ?? 0n;
  return av < bv ? 1 : av > bv ? -1 : 0;
}

/**
 * Ranked proposals — ONLY after a reveal AND for an authorised viewer. Throws otherwise so a
 * caller cannot leak competitor prices before the window closes or to an unauthorised party.
 */
export function revealedRankedOffers(
  offers: readonly SealedOffer[],
  opts: { revealed: boolean; viewer: SealedViewerRole },
): SealedOffer[] {
  if (!opts.revealed) throw new IllegalTransition('sealed offers are not revealed yet');
  if (!canRevealSealedOffers(opts.viewer) && opts.viewer !== 'auditor') {
    throw new IllegalTransition('viewer is not authorised to see sealed proposals');
  }
  return offers.filter(isPriced).sort(byPriceDesc);
}

/**
 * Choose the winning sealed offer — the heart of DECISIONS D4.
 *  - `MANUAL_SELECTION` (default): the winner is ONLY the offer the authorised seller/admin
 *    explicitly selects. The highest proposal is NEVER chosen automatically; a missing selection
 *    throws.
 *  - `AUTO_HIGHEST`: permitted ONLY when the event is explicitly configured with this policy;
 *    then the highest priced, non-withdrawn proposal wins.
 * A winner can never be chosen before the reveal.
 */
export function selectSealedWinner(
  offers: readonly SealedOffer[],
  opts: { policy: OfferAwardPolicy; revealed: boolean; explicitSelectionId?: string },
): SealedOffer {
  if (!opts.revealed) throw new IllegalTransition('cannot select a winner before reveal');
  const eligible = offers.filter(isPriced);
  if (eligible.length === 0) throw new IllegalTransition('no eligible sealed offers');

  if (opts.policy === 'AUTO_HIGHEST') {
    return eligible.reduce((best, o) => (byPriceDesc(o, best) < 0 ? o : best));
  }
  // MANUAL_SELECTION — never auto-award the highest (D4).
  if (!opts.explicitSelectionId) {
    throw new IllegalTransition(
      'manual selection requires an explicitly chosen offer (D4: the highest never auto-awards)',
    );
  }
  const chosen = eligible.find((o) => o.id === opts.explicitSelectionId);
  if (!chosen) throw new IllegalTransition('selected offer is not an eligible sealed proposal');
  return chosen;
}
