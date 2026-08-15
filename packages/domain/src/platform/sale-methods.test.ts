import { describe, expect, it } from 'vitest';
import { saleMethodValues } from '@singha/contracts';
import {
  activeSaleMethods,
  bindsAutomatically,
  isAuctionMethod,
  saleMethodByCode,
  saleMethodForLegacyEnum,
  saleMethodsInFamily,
} from './sale-methods';

describe('sale-method taxonomy (Evolution E2)', () => {
  it('maps every legacy SaleMethod enum value 1:1 to an active definition (D3)', () => {
    for (const value of saleMethodValues) {
      const def = saleMethodForLegacyEnum(value);
      expect(def, `legacy ${value} must have a definition`).toBeDefined();
      // For migration safety the definition code equals the legacy enum value.
      expect(def?.code).toBe(value);
      expect(def?.active).toBe(true);
    }
  });

  it('never auto-binds an offer or sealed method (D4 — no silent auto-award)', () => {
    const offerCodes = [
      'MAKE_OFFER',
      'SEALED_TENDER',
      'SEALED_OFFER',
      'BEST_OFFER',
      'PRIVATE_OFFER',
      'NEGOTIATED_SALE',
      'FLASH_OFFER',
    ];
    for (const code of offerCodes) {
      expect(bindsAutomatically(code), `${code} must not auto-bind`).toBe(false);
      expect(saleMethodByCode(code)?.family).toBe('offer');
      expect(isAuctionMethod(code)).toBe(false);
    }
  });

  it('classifies auctions as auction mechanics that bind a winner', () => {
    for (const code of ['TIMED_AUCTION', 'LIVE_HYBRID', 'PREMIER_AUCTION']) {
      expect(isAuctionMethod(code)).toBe(true);
      expect(bindsAutomatically(code)).toBe(true);
      expect(saleMethodByCode(code)?.family).toBe('auction');
    }
  });

  it('currently exposes exactly the six legacy methods as active', () => {
    const active = activeSaleMethods()
      .map((m) => m.code)
      .sort();
    expect(active).toEqual([...saleMethodValues].sort());
  });

  it('groups procurement methods (E9) without activating them yet', () => {
    const procurement = saleMethodsInFamily('procurement').map((m) => m.code);
    expect(procurement).toContain('RFQ');
    expect(procurement).toContain('REQUEST_SUPPLY');
    expect(saleMethodsInFamily('procurement').every((m) => !m.active)).toBe(true);
  });

  it('treats unknown codes as unknown + non-binding (safe default)', () => {
    expect(saleMethodByCode('NOPE')).toBeUndefined();
    expect(bindsAutomatically('NOPE')).toBe(false);
    expect(isAuctionMethod('NOPE')).toBe(false);
  });
});
