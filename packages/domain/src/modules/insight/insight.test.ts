import { describe, expect, it } from 'vitest';
import {
  assessRisk,
  compareProposals,
  priceComparables,
  rankMatches,
  scoreMatch,
  type MatchCandidate,
} from './insight';

const candidate = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id: 'c1',
  category: 'produce',
  product: 'Red Onion',
  originCountry: 'IN',
  availableQuantity: '100',
  minOrderQuantity: '10',
  quantityUnitCode: 'MT',
  indicativePriceMinor: 500_00n,
  ...over,
});

describe('scoreMatch (deterministic, explainable)', () => {
  it('scores an exact match and excludes hard-filter failures', () => {
    const r = scoreMatch(
      { category: 'produce', product: 'onion', quantityRequired: '20', originCountry: 'IN' },
      candidate(),
    );
    expect(r?.score).toBe(30 + 15 + 20 + 25 + 10);
    expect(r?.factors).toContain('category:exact');
    // category mismatch → hard filter → null
    expect(scoreMatch({ category: 'metals' }, candidate())).toBeNull();
    // quantity below the candidate minimum → excluded
    expect(scoreMatch({ quantityRequired: '5' }, candidate({ minOrderQuantity: '10' }))).toBeNull();
    // quantity above availability → excluded
    expect(
      scoreMatch({ quantityRequired: '200' }, candidate({ availableQuantity: '100' })),
    ).toBeNull();
  });
});

describe('rankMatches', () => {
  it('ranks best-fit first, then cheapest, and drops non-matches', () => {
    const best = candidate({ id: 'best', indicativePriceMinor: 900_00n });
    const cheaperButSameFit = candidate({ id: 'cheap', indicativePriceMinor: 300_00n });
    const wrongCategory = candidate({ id: 'wrong', category: 'metals' });
    const ranked = rankMatches({ category: 'produce', quantityRequired: '20' }, [
      best,
      wrongCategory,
      cheaperButSameFit,
    ]);
    // same score → cheaper first; wrongCategory excluded
    expect(ranked.map((r) => r.candidateId)).toEqual(['cheap', 'best']);
  });
});

describe('compareProposals (Offer Intelligence — advisory only)', () => {
  it('ranks cheapest-first, flags cheapest/fastest, never binds', () => {
    const result = compareProposals([
      {
        id: 'a',
        totalPriceMinor: 900n,
        unitPriceMinor: null,
        quantity: null,
        deliveryDays: 5,
        incoterm: 'FOB',
      },
      {
        id: 'b',
        totalPriceMinor: 300n,
        unitPriceMinor: null,
        quantity: null,
        deliveryDays: 10,
        incoterm: 'CIF',
      },
      {
        id: 'c',
        totalPriceMinor: 600n,
        unitPriceMinor: null,
        quantity: null,
        deliveryDays: 2,
        incoterm: 'EXW',
      },
    ]);
    expect(result.binding).toBe(false);
    expect(result.ranked.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(result.cheapestId).toBe('b');
    expect(result.fastestId).toBe('c');
  });
});

describe('priceComparables (exact, float-free)', () => {
  it('computes count/min/median/max/spread', () => {
    expect(priceComparables([300n, 100n, 200n])).toEqual({
      count: 3,
      minMinor: 100n,
      medianMinor: 200n,
      maxMinor: 300n,
      spreadMinor: 200n,
    });
  });

  it('uses integer division for an even-count median and handles empty', () => {
    expect(priceComparables([100n, 200n, 300n, 500n]).medianMinor).toBe(250n);
    expect(priceComparables([]).count).toBe(0);
    expect(priceComparables([]).medianMinor).toBeNull();
  });
});

describe('assessRisk (review signal, never an auto-block)', () => {
  it('bands score and lists the flags that fired', () => {
    expect(assessRisk({ accountAgeDays: 400 })).toEqual({ score: 0, band: 'low', flags: [] });
    const high = assessRisk({
      accountAgeDays: 1,
      unverifiedHighValue: true,
      chargebackHistory: true,
    });
    expect(high.band).toBe('high');
    expect(high.flags).toEqual(['new_account', 'unverified_high_value', 'chargeback_history']);
    expect(assessRisk({ accountAgeDays: 1, rapidActions: 25 }).band).toBe('medium');
  });
});
