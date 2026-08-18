import { describe, expect, it } from 'vitest';
import { assessListingQuality, type ListingQualityInput } from './quality';

const complete: ListingQualityInput = {
  saleMethod: 'BUY_NOW',
  title: 'Toyota Land Cruiser Prado 2019',
  fullDescription: 'One owner, full service history, no accidents.',
  category: 'vehicles',
  requiredAttributeKeys: ['make', 'model', 'year'],
  presentAttributeKeys: ['make', 'model', 'year'],
  photoCount: 4,
  hasCover: true,
  buyNowPriceMinor: 12_500_000,
  hasLocation: true,
};

describe('assessListingQuality (§6/§7)', () => {
  it('scores a complete listing as ready with no criticals', () => {
    const a = assessListingQuality(complete);
    expect(a.advisory).toBe(true);
    expect(a.status).toBe('ready');
    expect(a.score).toBe(100);
    expect(a.checks.some((c) => c.severity === 'critical')).toBe(false);
  });

  it('flags missing title, photos, required attributes and buy-now price as critical → incomplete', () => {
    const a = assessListingQuality({
      ...complete,
      title: '',
      photoCount: 0,
      hasCover: false,
      presentAttributeKeys: ['make'], // missing model + year
      buyNowPriceMinor: null,
    });
    expect(a.status).toBe('incomplete');
    const criticalKeys = a.checks.filter((c) => c.severity === 'critical').map((c) => c.key);
    expect(criticalKeys).toContain('title');
    expect(criticalKeys).toContain('photos');
    expect(criticalKeys).toContain('required_attributes');
    expect(criticalKeys).toContain('price');
    expect(a.score).toBeLessThan(80);
  });

  it('warns (not blocks) on a divisible lot with no quantity + only one photo', () => {
    const a = assessListingQuality({
      ...complete,
      saleMethod: 'MAKE_OFFER',
      category: 'bulk',
      requiredAttributeKeys: ['itemType', 'quantity', 'unit'],
      presentAttributeKeys: ['itemType', 'quantity', 'unit'],
      isDivisible: true,
      quantityAvailable: null,
      quantityUnitCode: null,
      photoCount: 1,
      buyNowPriceMinor: null,
    });
    expect(a.status).toBe('needs_attention');
    expect(a.checks.some((c) => c.key === 'quantity' && c.severity === 'warn')).toBe(true);
    expect(a.checks.some((c) => c.key === 'photos' && c.severity === 'warn')).toBe(true);
    // No criticals — a warning never blocks (advisory).
    expect(a.checks.some((c) => c.severity === 'critical')).toBe(false);
  });

  it('folds Vision media-quality issues in as advisory warnings', () => {
    const a = assessListingQuality({ ...complete, mediaIssues: ['blur', 'duplicate'] });
    expect(a.checks.some((c) => c.key === 'media_blur' && c.severity === 'warn')).toBe(true);
    expect(a.checks.some((c) => c.key === 'media_duplicate' && c.severity === 'info')).toBe(true);
  });
});
