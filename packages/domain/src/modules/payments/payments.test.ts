import { describe, expect, it } from 'vitest';
import { type PaymentRouteView, resolvePaymentRoute } from './payments';

const route = (over: Partial<PaymentRouteView>): PaymentRouteView => ({
  code: 'R',
  version: 1,
  priority: 0,
  provider: 'AcmePay',
  providerKind: 'operator_gateway',
  instructionsRef: 'ref://pay',
  operatorCode: 'OP_LK',
  currency: null,
  jurisdiction: null,
  saleMethodCode: null,
  purpose: null,
  verification: 'verified',
  active: true,
  ...over,
});

const input = {
  operatorCode: 'OP_LK',
  currency: 'LKR',
  purpose: 'buyer_settlement' as const,
};

describe('payment route resolution (deterministic, regulated-only — pack 10)', () => {
  it('MANUAL_REVIEW when no route matches the operator', () => {
    const out = resolvePaymentRoute(input, [route({ operatorCode: 'OP_OTHER' })]);
    expect(out.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(out.routeCode).toBeNull();
  });

  it('resolves a verified operator route to an external provider', () => {
    const out = resolvePaymentRoute(input, [route({ code: 'LK_GW', currency: 'LKR' })]);
    expect(out.status).toBe('RESOLVED');
    expect(out.provider).toBe('AcmePay');
    expect(out.providerKind).toBe('operator_gateway');
    expect(out.requiresManualSettlement).toBe(false);
  });

  it('bank-transfer + offline routes require manual settlement (no internal ledger)', () => {
    const bank = resolvePaymentRoute(input, [
      route({ code: 'LK_BANK', providerKind: 'operator_bank_transfer' }),
    ]);
    expect(bank.status).toBe('RESOLVED');
    expect(bank.requiresManualSettlement).toBe(true);
  });

  it('an unverified/unlicensed route is a non-binding preview (O4)', () => {
    const out = resolvePaymentRoute(input, [
      route({ code: 'DRAFT', currency: 'LKR', verification: 'draft' }),
    ]);
    expect(out.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(out.routeCode).toBe('DRAFT'); // preview
    expect(out.reason).toMatch(/O4|verified|licensed/);
  });

  it('the most-specific verified route wins', () => {
    const generic = route({ code: 'ANY', provider: 'Generic' });
    const specific = route({ code: 'LK_LKR', currency: 'LKR', provider: 'Specific' });
    const out = resolvePaymentRoute(input, [generic, specific]);
    expect(out.routeCode).toBe('LK_LKR');
    expect(out.provider).toBe('Specific');
  });
});
