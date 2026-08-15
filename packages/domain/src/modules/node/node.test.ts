import { describe, expect, it } from 'vitest';
import { assessOrigination, resolveNodeCapabilities, type NodeConfig } from './node';
import { canonicalUrl, hreflangAlternates, listingJsonLd, sitemapEntries } from './seo';

const node = (over: Partial<NodeConfig> = {}): NodeConfig => ({
  code: 'LK',
  mode: 'LOCAL_COMMERCE',
  canOriginateListings: true,
  canTakeOffers: true,
  canRunAuctions: false,
  canAcceptPayments: false,
  verification: 'verified',
  ...over,
});

describe('assessOrigination (Satellite Market Node invariant)', () => {
  it('a Discovery node originates nothing — browse only', () => {
    const d = assessOrigination(node({ mode: 'DISCOVERY' }), 'listings');
    expect(d.allowed).toBe(false);
    expect(d.outcome).toBe('DISCOVERY_ONLY');
  });

  it('a disabled capability is refused', () => {
    expect(assessOrigination(node({ canRunAuctions: false }), 'auctions').outcome).toBe(
      'CAPABILITY_DISABLED',
    );
  });

  it('an unverified Local Commerce node is a non-binding MANUAL_REVIEW_REQUIRED preview (D7)', () => {
    expect(assessOrigination(node({ verification: 'draft' }), 'listings').outcome).toBe(
      'MANUAL_REVIEW_REQUIRED',
    );
    expect(assessOrigination(node({ verification: 'unverified' }), 'listings').allowed).toBe(false);
  });

  it('a verified, enabled Local Commerce node may originate (attribution, central record)', () => {
    const d = assessOrigination(node(), 'listings');
    expect(d.allowed).toBe(true);
    expect(d.outcome).toBe('ALLOWED');
  });

  it('resolveNodeCapabilities always allows browse', () => {
    expect(resolveNodeCapabilities(node({ mode: 'DISCOVERY' })).capabilities.browse).toBe(true);
  });
});

describe('SEO canonical (display currency never forks a URL)', () => {
  it('strips display-currency + tracking params and sorts the rest', () => {
    expect(
      canonicalUrl('https://singha.example/', '/lot/abc', {
        displayCurrency: 'USD',
        utm_source: 'fb',
        page: '2',
        sort: 'price',
      }),
    ).toBe('https://singha.example/lot/abc?page=2&sort=price');
  });

  it('drops the query entirely when only presentation params remain', () => {
    expect(canonicalUrl('https://singha.example', 'lot/abc', { currency: 'LKR' })).toBe(
      'https://singha.example/lot/abc',
    );
  });
});

describe('SEO hreflang + structured data + sitemap', () => {
  it('emits per-locale alternates plus x-default', () => {
    const alts = hreflangAlternates('https://singha.example', '/lot/abc', ['en', 'si']);
    expect(alts).toEqual([
      { hreflang: 'en', href: 'https://singha.example/en/lot/abc' },
      { hreflang: 'si', href: 'https://singha.example/si/lot/abc' },
      { hreflang: 'x-default', href: 'https://singha.example/lot/abc' },
    ]);
  });

  it('builds schema.org Product JSON-LD with an Offer', () => {
    const ld = listingJsonLd({
      publicRef: 'LOT-1',
      title: 'Red Onion 10MT',
      category: 'produce',
      priceMinor: 123450,
      currency: 'USD',
      url: 'https://singha.example/lot/lot-1',
    });
    expect(ld['@type']).toBe('Product');
    expect((ld.offers as Record<string, unknown>).price).toBe('1234.50');
    expect((ld.offers as Record<string, unknown>).priceCurrency).toBe('USD');
  });

  it('builds sitemap entries with defaults', () => {
    expect(sitemapEntries('https://singha.example', [{ path: '/explore' }])).toEqual([
      { loc: 'https://singha.example/explore', changefreq: 'daily', priority: 0.5 },
    ]);
  });
});
