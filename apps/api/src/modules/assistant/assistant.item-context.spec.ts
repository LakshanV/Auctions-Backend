import { describe, expect, it } from 'vitest';
import {
  type CatalogueItemSource,
  suggestionsForSaleMethod,
  toItemContext,
} from './assistant.item-context';

const FORBIDDEN_SUBSTRINGS = [
  'reserve',
  'proxymax',
  'sellerfloor',
  'riskscore',
  'staffnote',
  'competitor',
];

describe('toItemContext (AIC-1 privacy allowlist)', () => {
  it('maps only the customer-safe fields for a timed auction', () => {
    const listing: CatalogueItemSource = {
      id: 'listing_1',
      reference: 'LOT-0001',
      title: 'Vintage Rolex',
      category: 'jewellery',
      saleMethod: 'TIMED_AUCTION',
      location: { city: 'Colombo', region: 'Western' },
      collectionSummary: 'Collect from our Colombo warehouse, Mon-Fri 9-5.',
      commercial: {
        kind: 'auction',
        currency: 'LKR',
        currentBidMinor: 500_000,
        openingBidMinor: 100_000,
        endsAt: '2026-09-01T00:00:00.000Z',
        extendedCount: 0,
      },
    };

    const ctx = toItemContext(listing, 'https://singha.example/lots/listing_1');

    expect(ctx).toEqual({
      listingId: 'listing_1',
      publicRef: 'LOT-0001',
      title: 'Vintage Rolex',
      category: 'jewellery',
      saleMethod: 'TIMED_AUCTION',
      currency: 'LKR',
      commercial: {
        kind: 'auction',
        currency: 'LKR',
        currentBidMinor: 500_000,
        openingBidMinor: 100_000,
        endsAt: '2026-09-01T00:00:00.000Z',
        extendedCount: 0,
      },
      location: { city: 'Colombo', region: 'Western' },
      closesAt: '2026-09-01T00:00:00.000Z',
      collectionSummary: 'Collect from our Colombo warehouse, Mon-Fri 9-5.',
      url: 'https://singha.example/lots/listing_1',
    });
  });

  it('derives closesAt from the EOI/sealed-tender `closesAt` field (not `endsAt`)', () => {
    const listing: CatalogueItemSource = {
      id: 'listing_2',
      reference: 'LOT-0002',
      title: 'Antique desk',
      category: 'furniture',
      saleMethod: 'EXPRESSION_OF_INTEREST',
      location: null,
      collectionSummary: null,
      commercial: {
        kind: 'eoi',
        currency: 'LKR',
        guidePriceMinor: 200_000,
        interestCount: 3,
        closesAt: '2026-10-01T00:00:00.000Z',
      },
    };

    const ctx = toItemContext(listing);

    expect(ctx.closesAt).toBe('2026-10-01T00:00:00.000Z');
    expect(ctx.location).toBeUndefined();
    expect(ctx.collectionSummary).toBeUndefined();
    expect(ctx.url).toBeUndefined();
  });

  it('has no deadline for Buy Now / Make Offer (neither endsAt nor closesAt)', () => {
    const listing: CatalogueItemSource = {
      id: 'listing_3',
      reference: 'LOT-0003',
      title: 'Camera',
      category: 'electronics',
      saleMethod: 'BUY_NOW',
      commercial: { kind: 'buy_now', currency: 'LKR', priceMinor: 90_000 },
    };

    expect(toItemContext(listing).closesAt).toBeNull();
  });

  /**
   * The core AIC-1 privacy assertion: even if `CatalogueV2Service.get()` ever regressed and
   * started returning internal/competitive fields (reserve, proxy max, seller floor, risk score,
   * staff notes, competitor data), this mapper's explicit allowlist — plus the independent
   * `redactContext` pass over the nested `commercial` object — must still strip every one of
   * them. Nothing is ever spread/passed through wholesale.
   */
  it('strips reserve/proxyMax/sellerFloor/riskScore/staffNote/competitor even if the source leaks them', () => {
    const poisoned = {
      id: 'listing_4',
      reference: 'LOT-0004',
      title: 'Poisoned lot',
      category: 'vehicles',
      saleMethod: 'TIMED_AUCTION',
      location: { city: 'Colombo', region: null },
      collectionSummary: 'Collect on-site.',
      commercial: {
        kind: 'auction',
        currency: 'LKR',
        currentBidMinor: 500_000,
        openingBidMinor: 100_000,
        endsAt: '2026-09-01T00:00:00.000Z',
        extendedCount: 0,
        // Simulated upstream regression — these must NEVER survive the mapper.
        reserveMinor: 2_000_000,
        proxyMaxMinor: 3_000_000,
        sellerFloorMinor: 1_500_000,
        riskScore: 92,
        staffNote: 'buyer flagged for review',
        competitorOfferId: 'offer_999',
      },
      // Top-level junk: the allowlist mapper reads named fields only, never spreads this in.
      reserve: 2_000_000,
      proxyMax: 3_000_000,
      sellerFloor: 1_500_000,
      riskScore: 92,
      staffNote: 'buyer flagged for review',
      competitor: { id: 'c1' },
    };

    const ctx = toItemContext(poisoned as unknown as CatalogueItemSource, 'https://x/lots/4');

    // Exact, closed set of top-level keys — nothing extra ever leaks through.
    expect(Object.keys(ctx).sort()).toEqual(
      [
        'listingId',
        'publicRef',
        'title',
        'category',
        'saleMethod',
        'currency',
        'commercial',
        'location',
        'closesAt',
        'collectionSummary',
        'url',
      ].sort(),
    );
    expect(Object.keys(ctx.commercial).sort()).toEqual(
      ['kind', 'currency', 'currentBidMinor', 'openingBidMinor', 'endsAt', 'extendedCount'].sort(),
    );

    const json = JSON.stringify(ctx).toLowerCase();
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(json).not.toContain(forbidden);
    }
  });
});

describe('suggestionsForSaleMethod (AIC-1 — labels only, never actions)', () => {
  it('returns sale-method-specific labels', () => {
    expect(suggestionsForSaleMethod('MAKE_OFFER')).toContain('Make an offer');
    expect(suggestionsForSaleMethod('EXPRESSION_OF_INTEREST')).toContain('Register interest');
    expect(suggestionsForSaleMethod('SEALED_TENDER')).toContain('Submit a sealed tender');
  });

  it('falls back to a generic default for an unknown or missing sale method', () => {
    expect(suggestionsForSaleMethod(undefined)).toEqual([
      'Browse the catalogue',
      'Contact a specialist',
    ]);
    expect(suggestionsForSaleMethod('SOMETHING_NEW')).toEqual([
      'Browse the catalogue',
      'Contact a specialist',
    ]);
  });

  it('never returns a label that reads as a bid-placement action', () => {
    for (const method of [
      'TIMED_AUCTION',
      'LIVE_HYBRID',
      'BUY_NOW',
      'MAKE_OFFER',
      'SEALED_TENDER',
    ]) {
      for (const label of suggestionsForSaleMethod(method)) {
        expect(label.toLowerCase()).not.toMatch(/\bplace\b.*\bbid\b/);
      }
    }
  });
});
