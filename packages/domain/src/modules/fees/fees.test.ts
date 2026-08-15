import { describe, expect, it } from 'vitest';
import { type FeeRuleView, computeCharges } from './fees';

const rule = (over: Partial<FeeRuleView>): FeeRuleView => ({
  code: 'R',
  version: 1,
  priority: 0,
  component: 'buyer_premium',
  side: 'BUYER',
  basis: 'PERCENT',
  rateBps: 1000, // 10%
  fixedMinor: null,
  appliesTo: 'PRINCIPAL',
  operatorCode: null,
  jurisdiction: null,
  category: null,
  saleMethodCode: null,
  minPrincipalMinor: null,
  maxPrincipalMinor: null,
  verification: 'verified',
  ...over,
});

describe('fee/tax engine (deterministic, float-free — D5/D6)', () => {
  it('no rules → all zeros, RESOLVED', () => {
    const out = computeCharges({ principalMinor: 100_000n }, []);
    expect(out.buyerFeesMinor).toBe(0n);
    expect(out.taxMinor).toBe(0n);
    expect(out.buyerTotalMinor).toBe(100_000n);
    expect(out.sellerProceedsMinor).toBe(100_000n);
    expect(out.status).toBe('RESOLVED');
  });

  it('computes a full breakdown (premium + fixed platform fee + tax on subtotal + seller commission)', () => {
    const out = computeCharges({ principalMinor: 100_000n }, [
      rule({ code: 'PREM', component: 'buyer_premium', rateBps: 1000 }), // 10% = 10,000
      rule({
        code: 'PLAT',
        component: 'platform_fee',
        basis: 'FIXED',
        fixedMinor: 5_000n,
        rateBps: null,
      }),
      rule({
        code: 'TAX',
        component: 'tax',
        rateBps: 1500, // 15%
        appliesTo: 'BUYER_SUBTOTAL',
      }),
      rule({ code: 'COMM', component: 'seller_commission', side: 'SELLER', rateBps: 800 }), // 8%
    ]);
    expect(out.buyerFeesMinor).toBe(15_000n); // 10,000 + 5,000
    expect(out.taxMinor).toBe(17_250n); // 15% of 115,000
    expect(out.buyerTotalMinor).toBe(132_250n);
    expect(out.sellerCommissionMinor).toBe(8_000n);
    expect(out.sellerProceedsMinor).toBe(92_000n);
    expect(out.status).toBe('RESOLVED');
  });

  it('records the applied rule + rate on each line (reproducible after rules change)', () => {
    const out = computeCharges({ principalMinor: 100_000n }, [
      rule({ code: 'PREM', version: 3, rateBps: 1000 }),
    ]);
    const line = out.lines.find((l) => l.component === 'buyer_premium')!;
    expect(line.appliedRuleCode).toBe('PREM');
    expect(line.appliedRuleVersion).toBe(3);
    expect(line.rateBps).toBe(1000);
    expect(line.amountMinor).toBe(10_000n);
  });

  it('an unverified applied rule makes the breakdown a non-binding preview (O3 / D7)', () => {
    const out = computeCharges({ principalMinor: 100_000n }, [
      rule({ code: 'TAX', component: 'tax', rateBps: 1500, verification: 'draft' }),
    ]);
    expect(out.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(out.reason).toMatch(/not owner-verified/);
  });

  it('applies exactly the MOST SPECIFIC rule per component (no double-charge)', () => {
    const out = computeCharges({ principalMinor: 100_000n, category: 'gems' }, [
      rule({ code: 'GENERIC', component: 'buyer_premium', rateBps: 1000 }), // wildcard 10%
      rule({ code: 'GEMS', component: 'buyer_premium', rateBps: 1200, category: 'gems' }), // 12%
    ]);
    // Only the gems rule applies → 12,000 (not 10,000 + 12,000).
    expect(out.buyerFeesMinor).toBe(12_000n);
    expect(out.lines.filter((l) => l.component === 'buyer_premium')).toHaveLength(1);
    expect(out.lines[0]?.appliedRuleCode).toBe('GEMS');
  });

  it('respects a value band (rule applies only within [min,max] principal)', () => {
    const highValue = rule({ code: 'HV', rateBps: 500, minPrincipalMinor: 200_000n });
    expect(computeCharges({ principalMinor: 100_000n }, [highValue]).buyerFeesMinor).toBe(0n);
    expect(computeCharges({ principalMinor: 250_000n }, [highValue]).buyerFeesMinor).toBe(12_500n);
  });

  it('rounds a percentage half-up and rejects a negative principal', () => {
    // 50% of 15 = 7.5 → 8.
    expect(computeCharges({ principalMinor: 15n }, [rule({ rateBps: 5000 })]).buyerFeesMinor).toBe(
      8n,
    );
    expect(() => computeCharges({ principalMinor: -1n }, [])).toThrow();
  });
});
