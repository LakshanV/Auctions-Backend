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
