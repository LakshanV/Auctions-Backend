import { describe, expect, it } from 'vitest';
import {
  bindingTotalMinor,
  canRevealSealedOffers,
  comparableHeadlineMinor,
  defaultAwardPolicy,
  isCounterAuthor,
  nextRevisionNumber,
  parseQuantityToScaled,
  revealedRankedOffers,
  sealedParticipationView,
  selectSealedWinner,
  type SealedOffer,
} from './offer-revision';

const offers: SealedOffer[] = [
  { id: 'a', totalPriceMinor: 100n, status: 'open' },
  { id: 'b', totalPriceMinor: 300n, status: 'open' }, // highest priced, live
  { id: 'c', totalPriceMinor: 200n, status: 'open' },
  { id: 'd', totalPriceMinor: 500n, status: 'withdrawn' }, // withdrawn — excluded everywhere
  { id: 'e', totalPriceMinor: null, status: 'open' }, // participating, no price yet
];

describe('offer revisions', () => {
  it('numbers revisions append-only (1-based, max + 1)', () => {
    expect(nextRevisionNumber([])).toBe(1);
    expect(nextRevisionNumber([{ revisionNumber: 1 }, { revisionNumber: 2 }])).toBe(3);
  });

  it('identifies counter authors (seller/operator) vs the buyer', () => {
    expect(isCounterAuthor('seller')).toBe(true);
    expect(isCounterAuthor('operator')).toBe(true);
    expect(isCounterAuthor('buyer')).toBe(false);
  });
});

describe('binding total (money-critical, float-free — DECISIONS D5)', () => {
  it('parses decimal quantities to a 10^9-scaled integer (no float)', () => {
    expect(parseQuantityToScaled('1')).toBe(1_000_000_000n);
    expect(parseQuantityToScaled('2.5')).toBe(2_500_000_000n);
    expect(parseQuantityToScaled('0.000000001')).toBe(1n);
    expect(() => parseQuantityToScaled('1.2.3')).toThrow();
    expect(() => parseQuantityToScaled('abc')).toThrow();
    expect(() => parseQuantityToScaled('1.1234567891')).toThrow(); // > 9 dp
  });

  it('prefers an explicit total price', () => {
    expect(bindingTotalMinor({ totalPriceMinor: 500n, unitPriceMinor: 999n, quantity: '3' })).toBe(
      500n,
    );
  });

  it('derives unit price × quantity only when it is an exact number of minor units', () => {
    expect(
      bindingTotalMinor({ totalPriceMinor: null, unitPriceMinor: 25_000n, quantity: '100' }),
    ).toBe(2_500_000n);
    // 2.5 units × 200 = 500 minor units, exact.
    expect(
      bindingTotalMinor({ totalPriceMinor: null, unitPriceMinor: 200n, quantity: '2.5' }),
    ).toBe(500n);
  });

  it('refuses to invent rounding — a fractional minor-unit product throws (deferred to E8)', () => {
    // 1 minor unit × 0.5 = 0.5 minor units → not representable, must throw.
    expect(() =>
      bindingTotalMinor({ totalPriceMinor: null, unitPriceMinor: 1n, quantity: '0.5' }),
    ).toThrow();
  });

  it('throws when there is no derivable price at all, and on non-positive quantity', () => {
    expect(() =>
      bindingTotalMinor({ totalPriceMinor: null, unitPriceMinor: null, quantity: '10' }),
    ).toThrow();
    expect(() =>
      bindingTotalMinor({ totalPriceMinor: null, unitPriceMinor: 100n, quantity: '0' }),
    ).toThrow();
  });

  it('comparableHeadlineMinor returns null instead of throwing when no total can be derived', () => {
    expect(
      comparableHeadlineMinor({ totalPriceMinor: 700n, unitPriceMinor: null, quantity: null }),
    ).toBe(700n);
    expect(
      comparableHeadlineMinor({ totalPriceMinor: null, unitPriceMinor: 1n, quantity: '0.5' }),
    ).toBeNull();
    expect(
      comparableHeadlineMinor({ totalPriceMinor: null, unitPriceMinor: null, quantity: null }),
    ).toBeNull();
  });
});

describe('sealed-offer confidentiality (pack doc 20)', () => {
  it('public view is counts only — never amounts', () => {
    expect(sealedParticipationView(offers)).toEqual({ participants: 4, offersReceived: 3 });
  });

  it('buyers cannot reveal; seller/operator/admin can', () => {
    expect(canRevealSealedOffers('buyer')).toBe(false);
    expect(canRevealSealedOffers('seller')).toBe(true);
    expect(canRevealSealedOffers('operator')).toBe(true);
    expect(canRevealSealedOffers('admin')).toBe(true);
  });

  it('never returns ranked proposals before reveal or to an unauthorised viewer', () => {
    expect(() => revealedRankedOffers(offers, { revealed: false, viewer: 'seller' })).toThrow();
    expect(() => revealedRankedOffers(offers, { revealed: true, viewer: 'buyer' })).toThrow();
  });

  it('reveals ranked (highest first, excluding withdrawn/unpriced) to an authorised viewer', () => {
    const ranked = revealedRankedOffers(offers, { revealed: true, viewer: 'seller' });
    expect(ranked.map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('sealed winner selection (DECISIONS D4 — no silent auto-award)', () => {
  it('MANUAL_SELECTION never auto-awards the highest — a missing choice throws', () => {
    expect(() =>
      selectSealedWinner(offers, { policy: 'MANUAL_SELECTION', revealed: true }),
    ).toThrow();
  });

  it('MANUAL_SELECTION returns exactly the chosen offer — even the lowest, on full terms', () => {
    const winner = selectSealedWinner(offers, {
      policy: 'MANUAL_SELECTION',
      revealed: true,
      explicitSelectionId: 'a', // lowest price; a seller may choose on delivery/terms, not price
    });
    expect(winner.id).toBe('a');
  });

  it('MANUAL_SELECTION rejects a withdrawn / unknown selection', () => {
    for (const id of ['d', 'zzz']) {
      expect(() =>
        selectSealedWinner(offers, {
          policy: 'MANUAL_SELECTION',
          revealed: true,
          explicitSelectionId: id,
        }),
      ).toThrow();
    }
  });

  it('AUTO_HIGHEST picks the highest — but the default policy is NOT auto-highest', () => {
    expect(selectSealedWinner(offers, { policy: 'AUTO_HIGHEST', revealed: true }).id).toBe('b');
    expect(defaultAwardPolicy()).toBe('MANUAL_SELECTION');
  });

  it('never selects before reveal, and errors when there are no eligible offers', () => {
    expect(() => selectSealedWinner(offers, { policy: 'AUTO_HIGHEST', revealed: false })).toThrow();
    expect(() =>
      selectSealedWinner([{ id: 'x', totalPriceMinor: null, status: 'open' }], {
        policy: 'AUTO_HIGHEST',
        revealed: true,
      }),
    ).toThrow();
  });
});
