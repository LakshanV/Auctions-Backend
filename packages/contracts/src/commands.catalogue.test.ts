import { describe, expect, it } from 'vitest';
import {
  catalogueQuerySchema,
  catalogueRowQuerySchema,
  createListingSchema,
  generateListingReference,
} from './commands';

/**
 * §5 — the public listing reference is server-assigned when the seller omits it, and branded
 * (SNG-YYYY-XXXXXXXX). These pin both the optionality in the contract and the reference format.
 */
describe('listing reference — server-generated (§5)', () => {
  it('accepts a create without a publicRef (server will assign one)', () => {
    const parsed = createListingSchema.parse({ assetId: 'a1', saleMethod: 'TIMED_AUCTION' });
    expect(parsed.publicRef).toBeUndefined();
  });

  it('still accepts a caller-supplied publicRef and keeps its constraints', () => {
    const parsed = createListingSchema.parse({
      assetId: 'a1',
      saleMethod: 'BUY_NOW',
      publicRef: 'LEGACY-123',
    });
    expect(parsed.publicRef).toBe('LEGACY-123');
    expect(() =>
      createListingSchema.parse({ assetId: 'a1', saleMethod: 'BUY_NOW', publicRef: 'bad ref!' }),
    ).toThrow();
  });

  it('generates a branded, uppercase, uniquely-derived reference from the id', () => {
    const ref = generateListingReference('01M0A0W5R5Q13S3KPD2E06CE24', 2026);
    expect(ref).toMatch(/^SNG-2026-[0-9A-Z]{8}$/);
    // Derived from the id tail → different ids yield different references.
    expect(generateListingReference('01M0A0W5R5Q13S3KPD2E06CE24', 2026)).not.toBe(
      generateListingReference('01M0A0W5R5Q13S3KPD2E06CE99', 2026),
    );
  });
});

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
