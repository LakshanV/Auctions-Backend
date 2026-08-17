import { describe, expect, it } from 'vitest';
import { catalogueQuerySchema, catalogueRowQuerySchema } from './commands';

/**
 * V3 non-negotiable (pack doc 08): when the catalogue `sort` is omitted the server
 * defaults to Ending Soon — a backend semantic, not just a UI dropdown label. These
 * tests pin that default in the contract so it cannot silently regress to Newest.
 */
describe('catalogue query — Ending Soon default', () => {
  it('defaults sort to "ending" when omitted (full catalogue query)', () => {
    const q = catalogueQuerySchema.parse({});
    expect(q.sort).toBe('ending');
  });

  it('defaults sort to "ending" when omitted (per-category row query)', () => {
    const q = catalogueRowQuerySchema.parse({ category: 'vehicles' });
    expect(q.sort).toBe('ending');
  });

  it('still honours an explicit sort', () => {
    expect(catalogueQuerySchema.parse({ sort: 'newest' }).sort).toBe('newest');
    expect(catalogueQuerySchema.parse({ sort: 'price_asc' }).sort).toBe('price_asc');
  });

  it('rejects an unknown sort value', () => {
    expect(() => catalogueQuerySchema.parse({ sort: 'cheapest' })).toThrow();
  });
});

/**
 * RW4 — additive server-side facets. They coerce from query strings, stay optional (absent when
 * omitted, so the prior behaviour is preserved), and reject nonsense.
 */
describe('catalogue query — RW4 facets', () => {
  it('coerces price/quantity/unit from query strings and reads pickup/delivery as truthy-presence flags', () => {
    const q = catalogueQuerySchema.parse({
      minPriceMinor: '100000',
      maxPriceMinor: '5000000',
      minQuantity: '10',
      maxQuantity: '500',
      unit: 'MT',
      pickup: 'true',
      delivery: 'true',
    });
    expect(q.minPriceMinor).toBe(100000);
    expect(q.maxPriceMinor).toBe(5000000);
    expect(q.minQuantity).toBe(10);
    expect(q.maxQuantity).toBe(500);
    expect(q.unit).toBe('MT');
    // pickup/delivery are presence flags (like featured/endingSoon): send `?pickup=true` to filter,
    // or omit — buildWhere only narrows on a truthy value, so it is never a "no pickup" filter.
    expect(q.pickup).toBe(true);
    expect(q.delivery).toBe(true);
  });

  it('leaves the facets undefined when omitted (backward compatible)', () => {
    const q = catalogueQuerySchema.parse({});
    expect(q.minPriceMinor).toBeUndefined();
    expect(q.pickup).toBeUndefined();
    expect(q.delivery).toBeUndefined();
    expect(q.unit).toBeUndefined();
  });

  it('rejects a negative price and a non-numeric quantity', () => {
    expect(() => catalogueQuerySchema.parse({ minPriceMinor: '-1' })).toThrow();
    expect(() => catalogueQuerySchema.parse({ maxQuantity: 'lots' })).toThrow();
  });

  it('exposes the same facets on the per-category row query', () => {
    const q = catalogueRowQuerySchema.parse({ category: 'general', unit: 'kg', pickup: '1' });
    expect(q.unit).toBe('kg');
    expect(q.pickup).toBe(true);
  });
});
