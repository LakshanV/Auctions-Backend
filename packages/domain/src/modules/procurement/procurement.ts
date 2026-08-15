import { IllegalTransition } from '../../kernel/errors';

/**
 * Procurement / reverse-tender engine (Evolution E9, pack doc 09). PURE logic for the buyer-
 * initiated two-sided market. The non-negotiable it guards: a procurement award is **never
 * automatic** — matching may rank/recommend, but a human buyer must explicitly select the winning
 * proposal (pack §09; consistent with DECISIONS D4). Lowest price is a recommendation, not a bind.
 */

export const PROCUREMENT_STATUSES = ['open', 'closed', 'awarded', 'cancelled'] as const;
export type ProcurementStatus = (typeof PROCUREMENT_STATUSES)[number];

export const PROCUREMENT_TRANSITIONS: Record<ProcurementStatus, ProcurementStatus[]> = {
  open: ['closed', 'cancelled'],
  closed: ['awarded', 'cancelled', 'open'],
  awarded: [],
  cancelled: [],
};

export function assertProcurementTransition(from: ProcurementStatus, to: ProcurementStatus): void {
  if (!PROCUREMENT_TRANSITIONS[from]?.includes(to)) {
    throw new IllegalTransition(`Procurement request cannot move ${from} -> ${to}`);
  }
}

export interface ProcurementProposalView {
  id: string;
  /** Comparable headline (total minor units); null = withdrawn or no comparable price. */
  totalPriceMinor: bigint | null;
  status: string;
}

const isLive = (p: ProcurementProposalView) => p.status !== 'withdrawn' && p.status !== 'rejected';
const isComparable = (p: ProcurementProposalView) => p.totalPriceMinor != null && isLive(p);

/** Participation counts (how many suppliers responded) — safe to show the buyer any time. */
export function procurementParticipation(proposals: readonly ProcurementProposalView[]): {
  suppliers: number;
  pricedProposals: number;
} {
  return {
    suppliers: proposals.filter(isLive).length,
    pricedProposals: proposals.filter(isComparable).length,
  };
}

/**
 * Rank proposals cheapest-first (a reverse tender favours the lowest price) — for buyer
 * RECOMMENDATION only. Excludes withdrawn/unpriced. Exact bigint compare; deterministic tie-break
 * by id so the order is stable.
 */
export function rankProcurementProposals(
  proposals: readonly ProcurementProposalView[],
): ProcurementProposalView[] {
  return proposals.filter(isComparable).sort((a, b) => {
    const av = a.totalPriceMinor ?? 0n;
    const bv = b.totalPriceMinor ?? 0n;
    if (av !== bv) return av < bv ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Select the winning proposal — the heart of E9's "never auto-award". Requires the request to be
 * closed AND an explicit buyer selection; the cheapest is NEVER chosen automatically. Returns
 * exactly the chosen proposal (which may not be the lowest — a buyer may prefer terms/quality).
 */
export function selectProcurementWinner(
  proposals: readonly ProcurementProposalView[],
  opts: { closed: boolean; explicitSelectionId?: string },
): ProcurementProposalView {
  if (!opts.closed) {
    throw new IllegalTransition('cannot award before the submission window is closed');
  }
  const eligible = proposals.filter(isComparable);
  if (eligible.length === 0) throw new IllegalTransition('no eligible proposals to award');
  if (!opts.explicitSelectionId) {
    throw new IllegalTransition(
      'procurement award requires an explicit buyer selection — matching never auto-awards (§09)',
    );
  }
  const chosen = eligible.find((p) => p.id === opts.explicitSelectionId);
  if (!chosen) throw new IllegalTransition('selected proposal is not an eligible proposal');
  return chosen;
}
