import { describe, expect, it } from 'vitest';
import {
  canRevealSealedOffers,
  defaultAwardPolicy,
  isCounterAuthor,
  nextRevisionNumber,
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
