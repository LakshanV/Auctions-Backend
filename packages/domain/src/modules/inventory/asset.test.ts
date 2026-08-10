import { describe, expect, it } from 'vitest';
import { Asset } from './asset';

describe('Asset vs Listing (docs/04)', () => {
  it('lets one asset back multiple sale attempts without losing identity', () => {
    const asset = Asset.create('vehicles');
    asset.markAvailable();

    const auction = asset.list('TIMED_AUCTION');
    const eoi = asset.list('EXPRESSION_OF_INTEREST');

    // Both listings reference the SAME enduring asset id.
    expect(auction.assetId).toBe(asset.id);
    expect(eoi.assetId).toBe(asset.id);
    // But each listing has its own distinct identity and sale method.
    expect(auction.id).not.toBe(eoi.id);
    expect(auction.saleMethod).toBe('TIMED_AUCTION');
    expect(eoi.saleMethod).toBe('EXPRESSION_OF_INTEREST');
  });

  it('carries a category schema version so old assets never break', () => {
    const asset = Asset.create('gems', 3);
    expect(asset.schemaVersion).toBe(3);
    expect(asset.lifecycle).toBe('draft');
    asset.markAvailable();
    expect(asset.lifecycle).toBe('available');
  });
});
