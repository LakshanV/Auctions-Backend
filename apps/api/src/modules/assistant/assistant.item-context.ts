import { redactContext } from '@singha/domain';

/**
 * Customer-facing AI conversation assistant (AIC-1, docs/10 "Customer AI"). Item context is the
 * ONLY per-lot data that may cross into a provider prompt, and this file is its single ALLOWLIST
 * mapper: every field is picked by name from `CatalogueV2Service.get()` (itself already
 * privacy-filtered — "no reserve, leader identity or proxy maxima", per its own header). Nothing
 * is ever spread/passed through wholesale, so a future field added to the catalogue card can
 * never silently leak here.
 *
 * `commercial` gets the SAME allowlist treatment via `pickCommercial()` below — NOT a generic
 * passthrough. This matters: `@singha/domain`'s `redactContext` (a second, independent pass
 * applied on top) only catches key names matching its generic secret/limit pattern
 * (token/secret/password/api-key/proxy/max/reserve/credit/exposure/score/weight/internal/ssn/
 * card) — it does NOT know about auction-domain concepts like "seller floor", "staff note" or
 * "competitor", which don't match that pattern at all. Only a per-field allowlist keyed on the
 * sale-method `kind` can guarantee those are excluded, so that is the PRIMARY control here;
 * `redactContext` is a true belt-and-suspenders extra, not the mechanism actually relied on.
 */
export interface ItemContext {
  listingId: string;
  publicRef: string;
  title: string;
  category: string;
  saleMethod: string;
  currency?: string;
  /** Sale-method-discriminated, already-safe visible price/offer-state (docs/07 `commercial`). */
  commercial: Record<string, unknown>;
  location?: { city?: string | null; region?: string | null };
  /** Auction `endsAt` or EOI/tender `closesAt` — whichever the sale method carries. */
  closesAt?: string | null;
  /** Publicly-visible logistics/collection summary. */
  collectionSummary?: string | null;
  /** The page URL the customer was on, passed by the client — informational only. */
  url?: string;
}

/** The structural slice of `CatalogueV2Service.get()`'s return value this mapper reads. */
export interface CatalogueItemSource {
  id: string;
  reference: string;
  title: string;
  category: string;
  saleMethod: string;
  location?: { city?: string | null; region?: string | null } | null;
  commercial: Record<string, unknown>;
  collectionSummary?: string | null;
}

/**
 * The exact fields `CatalogueV2Service.commercial()` puts on each sale-method-discriminated
 * shape (docs/07) — kept in sync manually with `catalogue-v2.service.ts#commercial()`. Anything
 * NOT listed here is dropped, regardless of what a future catalogue-side regression might add.
 */
const COMMERCIAL_ALLOWED_KEYS: Record<string, readonly string[]> = {
  auction: ['kind', 'currency', 'openingBidMinor', 'currentBidMinor', 'endsAt', 'extendedCount'],
  eoi: ['kind', 'currency', 'guidePriceMinor', 'interestCount', 'closesAt'],
  buy_now: ['kind', 'currency', 'priceMinor'],
  make_offer: ['kind', 'currency', 'guidePriceMinor', 'offerCount'],
  sealed_tender: ['kind', 'currency', 'guidePriceMinor', 'submissionCount', 'closesAt'],
};
const DEFAULT_COMMERCIAL_KEYS: readonly string[] = ['kind', 'currency'];

/** Allowlist a `commercial` payload down to only the fields its own `kind` is documented to carry. */
function pickCommercial(commercial: Record<string, unknown>): Record<string, unknown> {
  const kind = typeof commercial.kind === 'string' ? commercial.kind : undefined;
  const allowedKeys = (kind && COMMERCIAL_ALLOWED_KEYS[kind]) || DEFAULT_COMMERCIAL_KEYS;
  const picked: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in commercial) picked[key] = commercial[key];
  }
  return picked;
}

/** Map a public catalogue listing to the customer-safe ItemContext (AIC-1's one allowlist). */
export function toItemContext(listing: CatalogueItemSource, url?: string): ItemContext {
  const commercial = redactContext(pickCommercial(listing.commercial)).safe;
  const currency = typeof commercial.currency === 'string' ? commercial.currency : undefined;
  const closesAt = pickDeadline(commercial);

  return {
    listingId: listing.id,
    publicRef: listing.reference,
    title: listing.title,
    category: listing.category,
    saleMethod: listing.saleMethod,
    currency,
    commercial,
    location: listing.location
      ? { city: listing.location.city, region: listing.location.region }
      : undefined,
    closesAt,
    collectionSummary: listing.collectionSummary ?? undefined,
    url,
  };
}

/** Auctions carry `endsAt`; EOI/sealed-tender carry `closesAt`. Buy Now/Make Offer carry neither. */
function pickDeadline(commercial: Record<string, unknown>): string | null {
  const endsAt = commercial.endsAt;
  if (typeof endsAt === 'string' || endsAt instanceof Date) return String(endsAt);
  const closesAt = commercial.closesAt;
  if (typeof closesAt === 'string' || closesAt instanceof Date) return String(closesAt);
  return null;
}

const SALE_METHOD_SUGGESTIONS: Record<string, string[]> = {
  TIMED_AUCTION: ['Ask about bidding', 'Arrange inspection', 'Shipping & collection'],
  LIVE_HYBRID: ['Ask about bidding', 'Arrange inspection', 'Shipping & collection'],
  EXPRESSION_OF_INTEREST: ['Register interest', 'Arrange inspection', 'Shipping & collection'],
  BUY_NOW: ['Buy now', 'Arrange inspection', 'Shipping & collection'],
  MAKE_OFFER: ['Make an offer', 'Arrange inspection', 'Shipping & collection'],
  SEALED_TENDER: ['Submit a sealed tender', 'Arrange inspection', 'Shipping & collection'],
};

const DEFAULT_SUGGESTIONS: string[] = ['Browse the catalogue', 'Contact a specialist'];

/**
 * Small, customer-safe suggestion LABELS (never actions/links, never wired to a handler in this
 * slice) derived from the listing's sale method. The assistant may SUGGEST; creating a
 * bid/offer/EOI stays with the existing engines behind explicit confirmation (rule 11).
 */
export function suggestionsForSaleMethod(saleMethod?: string): string[] {
  if (!saleMethod) return DEFAULT_SUGGESTIONS;
  return SALE_METHOD_SUGGESTIONS[saleMethod] ?? DEFAULT_SUGGESTIONS;
}
