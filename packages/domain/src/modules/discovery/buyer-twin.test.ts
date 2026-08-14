import { describe, expect, it } from 'vitest';
import {
  BUYER_TWIN_VERSION,
  buildBuyerTwinProjection,
  emptyBuyerTwinProjection,
  toBuyerTwinSummary,
  type DiscoverySignal,
} from './buyer-twin';

const NOW = new Date('2026-08-14T00:00:00.000Z');
const sig = (
  over: Partial<DiscoverySignal> & Pick<DiscoverySignal, 'type' | 'category'>,
): DiscoverySignal => ({
  ...over,
});

describe('Buyer Twin engine (pack docs 06/11)', () => {
  it('stamps the current feature-schema version', () => {
    expect(buildBuyerTwinProjection([], NOW).version).toBe(BUYER_TWIN_VERSION);
  });

  it('weights explicit intent above passive behaviour', () => {
    // One PURCHASE of vehicles vs many IMPRESSIONs of machinery.
    const signals: DiscoverySignal[] = [
      sig({ type: 'PURCHASE', category: 'vehicles' }),
      ...Array.from({ length: 10 }, () => sig({ type: 'IMPRESSION', category: 'machinery' })),
    ];
    const p = buildBuyerTwinProjection(signals, NOW);
    expect(p.categoryAffinities[0]?.category).toBe('vehicles'); // 6 > 10×0.25
    // A single accidental impression does not overfit into high confidence.
    const one = buildBuyerTwinProjection([sig({ type: 'IMPRESSION', category: 'gems' })], NOW);
    expect(one.confidence).toBeLessThan(0.1);
  });

  it('is deterministic — identical signals + now produce an identical projection', () => {
    const signals: DiscoverySignal[] = [
      sig({ type: 'WATCH', category: 'gems', priceMinor: 500_000, saleMethod: 'TIMED_AUCTION' }),
      sig({ type: 'BID', category: 'gems', priceMinor: 800_000, saleMethod: 'TIMED_AUCTION' }),
      sig({ type: 'OPEN', category: 'property' }),
    ];
    expect(buildBuyerTwinProjection(signals, NOW)).toEqual(buildBuyerTwinProjection(signals, NOW));
  });

  it('excludes disliked/unwatched categories from positive affinities', () => {
    const p = buildBuyerTwinProjection(
      [
        sig({ type: 'WATCH', category: 'vehicles' }),
        sig({ type: 'DISLIKE', category: 'property' }),
        sig({ type: 'UNWATCH', category: 'bulk' }),
      ],
      NOW,
    );
    expect(p.categoryAffinities.map((a) => a.category)).toContain('vehicles');
    expect(p.categoryAffinities.map((a) => a.category)).not.toContain('property');
    expect(p.dislikedCategories).toEqual(['bulk', 'property']);
  });

  it('derives a price band and sale-method preference from positive signals only', () => {
    const p = buildBuyerTwinProjection(
      [
        sig({ type: 'BID', category: 'gems', priceMinor: 300_000, saleMethod: 'TIMED_AUCTION' }),
        sig({ type: 'WATCH', category: 'gems', priceMinor: 900_000, saleMethod: 'TIMED_AUCTION' }),
        sig({ type: 'OFFER', category: 'gems', priceMinor: 600_000, saleMethod: 'MAKE_OFFER' }),
      ],
      NOW,
    );
    expect(p.priceBandMinor).toEqual({ min: 300_000, max: 900_000 });
    expect(p.saleMethodPreference).toBe('TIMED_AUCTION'); // 5+3 > 5
  });

  it('reset — no signals yields an empty, low-confidence projection', () => {
    const p = emptyBuyerTwinProjection(NOW);
    expect(p.categoryAffinities).toEqual([]);
    expect(p.dislikedCategories).toEqual([]);
    expect(p.confidence).toBe(0);
    expect(p.signalCount).toBe(0);
  });

  it('stores NO sensitive fields — only the safe allow-listed projection keys', () => {
    const p = buildBuyerTwinProjection([sig({ type: 'WATCH', category: 'vehicles' })], NOW);
    expect(Object.keys(p).sort()).toEqual(
      [
        'builtAt',
        'categoryAffinities',
        'confidence',
        'dislikedCategories',
        'priceBandMinor',
        'saleMethodPreference',
        'signalCount',
        'version',
      ].sort(),
    );
  });

  it('summary hides raw scores/weights and buckets confidence with safe explanations', () => {
    const p = buildBuyerTwinProjection(
      Array.from({ length: 6 }, () =>
        sig({
          type: 'BID',
          category: 'vehicles',
          priceMinor: 500_000,
          saleMethod: 'TIMED_AUCTION',
        }),
      ),
      NOW,
    );
    const s = toBuyerTwinSummary(p);
    expect(s.topCategories).toEqual(['vehicles']);
    expect(['none', 'low', 'medium', 'high']).toContain(s.confidence);
    expect(s.confidence).toBe('high'); // 6×5 = 30 ≥ saturation
    expect(s.explanations.some((e) => /follow vehicles/i.test(e))).toBe(true);
    // The safe summary must not carry raw numeric scores.
    expect(JSON.stringify(s)).not.toMatch(/"score"/);
    // Empty projection → 'none' confidence, no explanations, null builtAt.
    const empty = toBuyerTwinSummary(emptyBuyerTwinProjection(NOW));
    expect(empty.confidence).toBe('none');
    expect(empty.explanations).toEqual([]);
    expect(empty.builtAt).toBeNull();
  });
});
