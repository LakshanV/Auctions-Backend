import { describe, expect, it } from 'vitest';
import {
  type ProcurementProposalView,
  assertProcurementTransition,
  procurementParticipation,
  rankProcurementProposals,
  selectProcurementWinner,
} from './procurement';

const proposals: ProcurementProposalView[] = [
  { id: 'a', totalPriceMinor: 300n, status: 'open' },
  { id: 'b', totalPriceMinor: 100n, status: 'open' }, // cheapest
  { id: 'c', totalPriceMinor: 200n, status: 'open' },
  { id: 'd', totalPriceMinor: 50n, status: 'withdrawn' }, // excluded
  { id: 'e', totalPriceMinor: null, status: 'open' }, // participating, unpriced
];

describe('procurement participation + ranking', () => {
  it('counts live suppliers and priced proposals', () => {
    expect(procurementParticipation(proposals)).toEqual({ suppliers: 4, pricedProposals: 3 });
  });

  it('ranks cheapest-first, excluding withdrawn/unpriced (recommendation only)', () => {
    expect(rankProcurementProposals(proposals).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('procurement award — never auto-award (§09 / D4)', () => {
  it('requires the window closed before awarding', () => {
    expect(() =>
      selectProcurementWinner(proposals, { closed: false, explicitSelectionId: 'b' }),
    ).toThrow();
  });

  it('requires an explicit buyer selection — the cheapest is not auto-chosen', () => {
    expect(() => selectProcurementWinner(proposals, { closed: true })).toThrow();
  });

  it('returns exactly the chosen proposal — even if not the cheapest (terms/quality)', () => {
    const winner = selectProcurementWinner(proposals, { closed: true, explicitSelectionId: 'a' });
    expect(winner.id).toBe('a'); // the dearest, chosen on full terms
  });

  it('rejects a withdrawn / unknown selection', () => {
    for (const id of ['d', 'zzz']) {
      expect(() =>
        selectProcurementWinner(proposals, { closed: true, explicitSelectionId: id }),
      ).toThrow();
    }
  });
});

describe('procurement lifecycle', () => {
  it('open → closed → awarded; rejects skips + terminal moves', () => {
    expect(() => assertProcurementTransition('open', 'closed')).not.toThrow();
    expect(() => assertProcurementTransition('closed', 'awarded')).not.toThrow();
    expect(() => assertProcurementTransition('open', 'awarded')).toThrow(); // must close first
    expect(() => assertProcurementTransition('awarded', 'open')).toThrow(); // terminal
  });
});
