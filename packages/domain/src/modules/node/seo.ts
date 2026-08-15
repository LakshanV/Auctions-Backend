/**
 * SEO / local-site engine (Evolution E13, pack doc 11 §Local sites + SEO). PURE, deterministic
 * canonical-URL, hreflang, structured-data and sitemap helpers. A key rule: **display currency (and
 * tracking params) never fork a listing URL** — the canonical strips them, so one listing has one
 * canonical URL across every local site and display currency.
 */

/** Presentation / tracking params that must never create a duplicate canonical URL. */
const STRIP_PARAMS = new Set([
  'displaycurrency',
  'currency',
  'lang',
  'language',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'fbclid',
  'gclid',
  'sessionid',
]);

const trimBase = (baseUrl: string) => baseUrl.replace(/\/+$/, '');
const asPath = (path: string) => (path.startsWith('/') ? path : `/${path}`);

/** Canonical URL for a path, dropping display-currency + tracking params and sorting the rest. */
export function canonicalUrl(
  baseUrl: string,
  path: string,
  params: Record<string, string> = {},
): string {
  const kept = Object.entries(params)
    .filter(([k]) => !STRIP_PARAMS.has(k.toLowerCase()))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const qs = kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const base = `${trimBase(baseUrl)}${asPath(path)}`;
  return qs ? `${base}?${qs}` : base;
}

export interface HreflangAlternate {
  hreflang: string;
  href: string;
}

/** hreflang alternates for the locales a page is available in, plus x-default. */
export function hreflangAlternates(
  baseUrl: string,
  path: string,
  locales: readonly string[],
): HreflangAlternate[] {
  const base = trimBase(baseUrl);
  const p = asPath(path);
  const alts: HreflangAlternate[] = locales.map((l) => ({ hreflang: l, href: `${base}/${l}${p}` }));
  alts.push({ hreflang: 'x-default', href: `${base}${p}` });
  return alts;
}

export interface ListingSeo {
  publicRef: string;
  title: string;
  category?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
  url: string;
  available?: boolean;
}

/** Format integer minor units to a 2-dp major string without floating point. */
function minorToMajor(minor: number): string {
  const neg = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${neg ? '-' : ''}${whole}.${String(frac).padStart(2, '0')}`;
}

/** schema.org Product/Offer JSON-LD for a listing (derived; never a source of truth). */
export function listingJsonLd(listing: ListingSeo): Record<string, unknown> {
  const jsonld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.title || listing.publicRef,
    sku: listing.publicRef,
    url: listing.url,
  };
  if (listing.category) jsonld.category = listing.category;
  if (listing.priceMinor != null && listing.currency) {
    jsonld.offers = {
      '@type': 'Offer',
      price: minorToMajor(listing.priceMinor),
      priceCurrency: listing.currency,
      url: listing.url,
      availability:
        listing.available === false
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
    };
  }
  return jsonld;
}

export interface SitemapInput {
  path: string;
  changefreq?: string;
  priority?: number;
  lastmod?: string;
}

export interface SitemapEntry {
  loc: string;
  changefreq: string;
  priority: number;
  lastmod?: string;
}

/** International sitemap entries (loc + defaults). */
export function sitemapEntries(baseUrl: string, entries: readonly SitemapInput[]): SitemapEntry[] {
  const base = trimBase(baseUrl);
  return entries.map((e) => ({
    loc: `${base}${asPath(e.path)}`,
    changefreq: e.changefreq ?? 'daily',
    priority: e.priority ?? 0.5,
    ...(e.lastmod ? { lastmod: e.lastmod } : {}),
  }));
}
