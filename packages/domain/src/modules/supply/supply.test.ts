import { describe, expect, it } from 'vitest';
import {
  assertOrderQuantities,
  assertSupplyProgrammeTransition,
  isSupplyProgrammeOfferable,
  recommendProgrammes,
  scaleDecimal,
  type SupplyProgrammeView,
} from './supply-programme';
import {
  assertPerishableConsistent,
  isPerishableExpired,
  perishableExpiresAt,
  type PerishableView,
} from './perishable';

const NOW = new Date('2026-06-15T00:00:00.000Z');

function programme(over: Partial<SupplyProgrammeView> = {}): SupplyProgrammeView {
  return {
    id: 'sp_1',
    status: 'active',
    product: 'Red Onion',
    category: 'produce',
    originCountry: 'IN',
    availableQuantity: '100',
    minOrderQuantity: '10',
    maxOrderQuantity: '100',
    quantityUnitCode: 'MT',
    indicativePriceMinor: 500_00n,
    leadTimeDays: 7,
    validFrom: null,
    validUntil: null,
    ...over,
  };
}

function perishable(over: Partial<PerishableView> = {}): PerishableView {
  return {
    harvestDate: null,
    packingDate: null,
    expiryDate: null,
    moisturePercent: null,
    tempMinC: null,
    tempMaxC: null,
    shipmentWindowStart: null,
    shipmentWindowEnd: null,
    ...over,
  };
}

describe('supply programme lifecycle', () => {
  it('allows draft → active → paused → active and refuses illegal moves', () => {
    expect(() => assertSupplyProgrammeTransition('draft', 'active')).not.toThrow();
    expect(() => assertSupplyProgrammeTransition('active', 'paused')).not.toThrow();
    expect(() => assertSupplyProgrammeTransition('paused', 'active')).not.toThrow();
    expect(() => assertSupplyProgrammeTransition('draft', 'expired')).toThrow();
    expect(() => assertSupplyProgrammeTransition('expired', 'active')).toThrow();
    expect(() => assertSupplyProgrammeTransition('withdrawn', 'active')).toThrow();
  });
});

describe('scaleDecimal (float-free)', () => {
  it('scales to exact integer minor at 9 dp and rejects over-precision', () => {
    expect(scaleDecimal('10')).toBe(10_000_000_000n);
    expect(scaleDecimal('1.5')).toBe(1_500_000_000n);
    expect(scaleDecimal('-18.5', 3)).toBe(-18_500n);
    expect(() => scaleDecimal('1.0000000001')).toThrow();
    expect(() => scaleDecimal('abc')).toThrow();
  });
});

describe('assertOrderQuantities', () => {
  it('accepts min ≤ max and rejects min > max or negatives', () => {
    expect(() => assertOrderQuantities('10', '100')).not.toThrow();
    expect(() => assertOrderQuantities('10', null)).not.toThrow();
    expect(() => assertOrderQuantities('100', '10')).toThrow();
    expect(() => assertOrderQuantities('-1', '10')).toThrow();
  });
});

describe('isSupplyProgrammeOfferable', () => {
  it('is true only when active and within the validity window', () => {
    expect(isSupplyProgrammeOfferable(programme(), NOW)).toBe(true);
    expect(isSupplyProgrammeOfferable(programme({ status: 'paused' }), NOW)).toBe(false);
    expect(isSupplyProgrammeOfferable(programme({ status: 'draft' }), NOW)).toBe(false);
    expect(
      isSupplyProgrammeOfferable(programme({ validFrom: new Date('2026-07-01T00:00:00Z') }), NOW),
    ).toBe(false);
    expect(
      isSupplyProgrammeOfferable(programme({ validUntil: new Date('2026-06-01T00:00:00Z') }), NOW),
    ).toBe(false);
  });
});

describe('recommendProgrammes (advisory only — never auto-awards, D4)', () => {
  it('ranks cheapest indicative price first and excludes non-offerable / out-of-range', () => {
    const cheap = programme({ id: 'sp_cheap', indicativePriceMinor: 300_00n });
    const dear = programme({ id: 'sp_dear', indicativePriceMinor: 900_00n });
    const draft = programme({ id: 'sp_draft', status: 'draft', indicativePriceMinor: 1n });
    const tooBig = programme({ id: 'sp_big', minOrderQuantity: '50' }); // wants 20 < min 50
    const recs = recommendProgrammes(
      [dear, draft, cheap, tooBig],
      { category: 'produce', product: 'onion', quantityRequired: '20' },
      NOW,
    );
    expect(recs.map((r) => r.programmeId)).toEqual(['sp_cheap', 'sp_dear']);
    // A recommendation is data, not a binding award — the shape carries no accepted/awarded state.
    expect(recs[0]).not.toHaveProperty('awarded');
    expect(recs[0]).not.toHaveProperty('status');
  });

  it('filters by origin/unit and sorts null-priced programmes last', () => {
    const priced = programme({ id: 'sp_priced', indicativePriceMinor: 700_00n });
    const unpriced = programme({ id: 'sp_unpriced', indicativePriceMinor: null, leadTimeDays: 2 });
    const wrongOrigin = programme({ id: 'sp_lk', originCountry: 'LK' });
    const recs = recommendProgrammes([unpriced, priced, wrongOrigin], { originCountry: 'IN' }, NOW);
    expect(recs.map((r) => r.programmeId)).toEqual(['sp_priced', 'sp_unpriced']);
  });
});

describe('perishable consistency (owner req 24)', () => {
  it('accepts a well-ordered record', () => {
    expect(() =>
      assertPerishableConsistent(
        perishable({
          harvestDate: new Date('2026-06-01T00:00:00Z'),
          packingDate: new Date('2026-06-02T00:00:00Z'),
          expiryDate: new Date('2026-07-01T00:00:00Z'),
          moisturePercent: '12.5',
          tempMinC: '-2',
          tempMaxC: '4',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects mis-ordered dates, out-of-range moisture and inverted temperatures', () => {
    expect(() =>
      assertPerishableConsistent(
        perishable({
          harvestDate: new Date('2026-06-03T00:00:00Z'),
          packingDate: new Date('2026-06-02T00:00:00Z'),
        }),
      ),
    ).toThrow();
    expect(() => assertPerishableConsistent(perishable({ moisturePercent: '101' }))).toThrow();
    expect(() =>
      assertPerishableConsistent(perishable({ tempMinC: '5', tempMaxC: '1' })),
    ).toThrow();
    expect(() =>
      assertPerishableConsistent(
        perishable({
          shipmentWindowStart: new Date('2026-07-10T00:00:00Z'),
          shipmentWindowEnd: new Date('2026-07-01T00:00:00Z'),
        }),
      ),
    ).toThrow();
  });
});

describe('perishable automatic expiry', () => {
  it('expires at the earliest of best-use date and shipment-window end', () => {
    const m = perishable({
      expiryDate: new Date('2026-07-01T00:00:00Z'),
      shipmentWindowEnd: new Date('2026-06-20T00:00:00Z'),
    });
    expect(perishableExpiresAt(m)?.toISOString()).toBe('2026-06-20T00:00:00.000Z');
    expect(isPerishableExpired(m, NOW)).toBe(false);
    expect(isPerishableExpired(m, new Date('2026-06-21T00:00:00Z'))).toBe(true);
  });

  it('never expires when no expiry bound is set', () => {
    expect(perishableExpiresAt(perishable())).toBeNull();
    expect(isPerishableExpired(perishable(), NOW)).toBe(false);
  });
});
