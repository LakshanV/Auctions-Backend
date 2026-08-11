import { describe, expect, it } from 'vitest';
import { IllegalTransition } from '../../kernel/errors';
import { assertFulfilmentTransition, canTransitionFulfilment } from './fulfilment';
import { computeInvoice, computeSettlement } from './money';

describe('commerce money', () => {
  it('computes a buyer invoice (premium + VAT on premium)', () => {
    const inv = computeInvoice(1_000_000, { buyerPremiumPct: 10, taxPct: 15 });
    expect(inv.buyerPremiumMinor).toBe(100_000);
    expect(inv.taxMinor).toBe(15_000);
    expect(inv.amountDueMinor).toBe(1_115_000);
  });

  it('applies a deposit against the amount due', () => {
    const inv = computeInvoice(
      1_000_000,
      { buyerPremiumPct: 0, taxPct: 0 },
      { depositAppliedMinor: 200_000 },
    );
    expect(inv.amountDueMinor).toBe(800_000);
  });

  it('computes a seller settlement (commission + VAT + deductions)', () => {
    const s = computeSettlement(
      1_000_000,
      { sellerCommissionPct: 8, taxPct: 15 },
      { deductionsMinor: 5_000 },
    );
    expect(s.commissionMinor).toBe(80_000);
    expect(s.commissionTaxMinor).toBe(12_000);
    expect(s.netMinor).toBe(903_000);
  });
});

describe('fulfilment lifecycle', () => {
  it('walks the pickup path to completed', () => {
    expect(canTransitionFulfilment('payment_pending', 'payment_confirmed')).toBe(true);
    expect(canTransitionFulfilment('payment_confirmed', 'release_approved')).toBe(true);
    expect(canTransitionFulfilment('ready_for_pickup', 'pickup_booked')).toBe(true);
    expect(canTransitionFulfilment('collected', 'completed')).toBe(true);
  });

  it('rejects skipping release before payment', () => {
    expect(canTransitionFulfilment('payment_pending', 'release_approved')).toBe(false);
    expect(() => assertFulfilmentTransition('payment_pending', 'release_approved')).toThrow(
      IllegalTransition,
    );
  });
});
