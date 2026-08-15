import { describe, expect, it } from 'vitest';
import { saleMethodValues } from './commands';
import {
  SALE_METHOD_DEFINITIONS,
  UNIT_DEFINITIONS,
  saleMethodDefinitionSchema,
  unitDefinitionSchema,
} from './config-domains';

/**
 * Data-integrity guards for the canonical taxonomy (Evolution E2). These iterate EVERY
 * definition (not a fixed example list) so a future E4/E9 edit — activating a new offer
 * method, or copy-pasting an auction row — cannot silently reintroduce a D3/D4 violation.
 */
describe('sale-method taxonomy integrity (D3/D4)', () => {
  it('D4: no offer/sealed method binds automatically (every row)', () => {
    for (const m of SALE_METHOD_DEFINITIONS) {
      if (m.family === 'offer') {
        expect(m.bindsAutomatically, `${m.code} is an offer and must not auto-bind`).toBe(false);
      }
    }
  });

  it('isAuction is true iff the method is in the auction family (every row)', () => {
    for (const m of SALE_METHOD_DEFINITIONS) {
      expect(m.isAuction, m.code).toBe(m.family === 'auction');
    }
  });

  it('D3: every legacy SaleMethod enum value maps to exactly one active definition', () => {
    for (const value of saleMethodValues) {
      const matches = SALE_METHOD_DEFINITIONS.filter((m) => m.legacyEnum === value);
      expect(matches, `legacy ${value}`).toHaveLength(1);
      expect(matches[0]?.code).toBe(value);
      expect(matches[0]?.active).toBe(true);
    }
  });

  it('D3: legacyEnum is unique across definitions (reverse 1:1)', () => {
    const used = SALE_METHOD_DEFINITIONS.map((m) => m.legacyEnum).filter((v) => v !== null);
    expect(new Set(used).size).toBe(used.length);
  });

  it('every definition has a unique code and passes the refined schema', () => {
    const codes = SALE_METHOD_DEFINITIONS.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const m of SALE_METHOD_DEFINITIONS) {
      expect(() => saleMethodDefinitionSchema.parse(m), m.code).not.toThrow();
    }
  });

  it('the schema structurally rejects an offer method that binds automatically (D4)', () => {
    const offer = SALE_METHOD_DEFINITIONS.find((m) => m.family === 'offer');
    expect(offer).toBeDefined();
    expect(() =>
      saleMethodDefinitionSchema.parse({ ...offer, bindsAutomatically: true }),
    ).toThrow();
  });

  it('the schema rejects an auction row not flagged isAuction (consistency)', () => {
    const auction = SALE_METHOD_DEFINITIONS.find((m) => m.family === 'auction');
    expect(() => saleMethodDefinitionSchema.parse({ ...auction, isAuction: false })).toThrow();
  });
});

describe('unit taxonomy integrity', () => {
  it('every unit has a unique code and passes its schema', () => {
    const codes = UNIT_DEFINITIONS.map((u) => u.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const u of UNIT_DEFINITIONS) {
      expect(() => unitDefinitionSchema.parse(u), u.code).not.toThrow();
    }
  });
});
