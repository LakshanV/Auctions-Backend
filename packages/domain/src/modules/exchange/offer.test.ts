import { describe, expect, it } from 'vitest';
import { IllegalTransition } from '../../kernel/errors';
import { OFFER_TERMINAL, assertOfferTransition, canTransitionOffer } from './offer';

describe('Make-Offer lifecycle', () => {
  it('allows repeated counters then acceptance', () => {
    expect(canTransitionOffer('open', 'countered')).toBe(true);
    expect(canTransitionOffer('countered', 'countered')).toBe(true);
    expect(canTransitionOffer('countered', 'accepted')).toBe(true);
  });

  it('forbids moving out of a terminal state', () => {
    for (const t of OFFER_TERMINAL) {
      expect(canTransitionOffer(t, 'countered')).toBe(false);
    }
    expect(() => assertOfferTransition('accepted', 'countered')).toThrow(IllegalTransition);
  });
});
