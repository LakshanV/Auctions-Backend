import { describe, expect, it } from 'vitest';
import {
  canBookQuote,
  estimateFreightMinor,
  isQuoteFresh,
  resolveFreightArranger,
  zoneMultiplierBps,
} from './logistics';

describe('freight responsibility (from Incoterm, pack 10)', () => {
  it('an explicit arranger wins over the Incoterm default', () => {
    expect(resolveFreightArranger({ sellerBearsFreight: true }, 'buyer')).toBe('buyer');
    expect(resolveFreightArranger({ sellerBearsFreight: false }, 'singha')).toBe('singha');
  });

  it('derives from the Incoterm when unspecified (CIF→seller, FOB→buyer)', () => {
    expect(resolveFreightArranger({ sellerBearsFreight: true })).toBe('seller');
    expect(resolveFreightArranger({ sellerBearsFreight: false })).toBe('buyer');
  });
});

describe('zone multiplier', () => {
  it('same country 100%, cross-border 250%, unknown 150%', () => {
    expect(zoneMultiplierBps('LK', 'LK')).toBe(10_000);
    expect(zoneMultiplierBps('LK', 'AU')).toBe(25_000);
    expect(zoneMultiplierBps(null, 'AU')).toBe(15_000);
  });
});

describe('freight estimate (float-free — D5)', () => {
  it('base × units × zone, exact integer minor units', () => {
    // SEA_FCL 500/unit × 10 units × 100% = 5,000 minor.
    expect(
      estimateFreightMinor({
        transportMode: 'SEA_FCL',
        chargeableUnits: 10,
        zoneMultiplierBps: 10_000,
      }),
    ).toBe(5_000n);
    // AIR 3,500/unit × 4 × 250% = 35,000 minor.
    expect(
      estimateFreightMinor({ transportMode: 'AIR', chargeableUnits: 4, zoneMultiplierBps: 25_000 }),
    ).toBe(35_000n);
  });

  it('rounds half-up and rejects bad input', () => {
    // 300 × 1 × 15000/10000 = 450 exactly; use an odd multiplier to exercise rounding.
    expect(
      estimateFreightMinor({
        transportMode: 'ROAD',
        chargeableUnits: 1,
        zoneMultiplierBps: 15_001,
      }),
    ).toBe(450n); // 300*15001/10000 = 450.03 → 450
    expect(() =>
      estimateFreightMinor({
        transportMode: 'ROAD',
        chargeableUnits: 0,
        zoneMultiplierBps: 10_000,
      }),
    ).toThrow();
  });
});

describe('quote freshness / bookability (a quote is not a booking)', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const future = new Date('2026-01-01T01:00:00Z');
  const past = new Date('2025-12-31T23:00:00Z');

  it('is fresh strictly before expiry', () => {
    expect(isQuoteFresh(future, now)).toBe(true);
    expect(isQuoteFresh(past, now)).toBe(false);
  });

  it('can book only a fresh, not-yet-accepted quote', () => {
    expect(canBookQuote('QUOTED', future, now)).toBe(true);
    expect(canBookQuote('EXPIRED', future, now)).toBe(false);
    expect(canBookQuote('ACCEPTED', future, now)).toBe(false);
    expect(canBookQuote('QUOTED', past, now)).toBe(false);
  });
});
