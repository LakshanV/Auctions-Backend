import { Injectable, NotFoundException } from '@nestjs/common';
import { CATEGORY_KEYS, type CatalogueQuery, type CatalogueRowQuery } from '@singha/contracts';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';

/** Filter fields shared by the full catalogue query and a single Rubik row. */
type CatalogueFilters = {
  category?: string;
  saleMethod?: CatalogueQuery['saleMethod'];
  status?: string;
  search?: string;
  location?: string;
  featured?: boolean;
  endingSoon?: boolean;
  auctionEventId?: string;
  // RW4 additive facets.
  minPriceMinor?: number;
  maxPriceMinor?: number;
  minQuantity?: number;
  maxQuantity?: number;
  unit?: string;
  pickup?: boolean;
  delivery?: boolean;
};

type FullListing = Prisma.ListingGetPayload<{
  include: {
    asset: { include: { media: true } };
    auction: true;
    eventLots: { include: { event: true } };
    _count: { select: { watches: true; eois: true; offers: true; tenderBids: true } };
  };
}>;

const PUBLIC_STATUSES = ['scheduled', 'live', 'ended', 'sold'] as const;
// V3 (pack doc 08): the DEFAULT open catalogue shows only live/upcoming inventory.
// Closed/sold lots have a past deadline and would otherwise sort to the very top of
// the Ending Soon default; a caller can still request them explicitly with `status`.
const OPEN_STATUSES = ['scheduled', 'live'] as const;

/**
 * Enriched public catalogue (consolidated pack doc 07): `/api/v2/catalogue` with
 * server-side filtering, pagination, facets and search, and a sale-aware
 * discriminated `commercial` payload (EOI never gets a meaningless currentBid).
 * Privacy-safe: no reserve, leader identity or proxy maxima.
 */
@Injectable()
export class CatalogueV2Service {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: CatalogueQuery) {
    const where = this.buildWhere(q);
    const orderBy = this.buildOrder(q);

    const [total, rows, statusFacet, saleMethodFacet, categoryFacet] = await Promise.all([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: this.include(),
      }),
      this.prisma.listing.groupBy({ by: ['status'], where, _count: true }).catch(() => []),
      this.prisma.listing.groupBy({ by: ['saleMethod'], where, _count: true }),
      // DB-side category facet (pack 01 doc 05): one bounded COUNT per known
      // category — the DB aggregates, we never transfer all matching rows to Node.
      // `category` lives on the Asset relation, so we constrain per key rather
      // than group by a relation field.
      Promise.all(
        CATEGORY_KEYS.map(async (value) => ({
          value,
          count: await this.prisma.listing.count({
            where: { AND: [where, { asset: { category: value } }] },
          }),
        })),
      ),
    ]);

    return {
      items: rows.map((l) => this.toCardV2(l as FullListing)),
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
      facets: {
        category: categoryFacet.filter((f) => f.count > 0).sort((a, b) => b.count - a.count),
        saleMethod: saleMethodFacet.map((f) => ({ value: f.saleMethod, count: f._count })),
        status: (statusFacet as { status: string; _count: number }[]).map((f) => ({
          value: f.status,
          count: f._count,
        })),
      },
    };
  }

  /**
   * One AuctionFlow/Rubik category row, cursor-paginated (pack 01 doc 05). The
   * row owns its own cursor so bands page independently and EVERY lot in the band
   * is reachable — not just the first page — with no repeats and a clean end.
   *
   * The opaque cursor is an offset into the fully-ordered band. Keyset (id-based)
   * cursors CANNOT seek correctly here because the Ending-Soon default orders by a
   * NULLABLE to-one relation column (`auction.endsAt`); a keyset on `id` collapses
   * after the first page (the AuctionFlow scale regression). Because `buildOrder`
   * always ends in the unique `id` tiebreaker, the total order is deterministic, so
   * offset paging is exact — no skipped, repeated or unreachable faces — across
   * every sort mode, including relation-ordered ones. Drift under concurrent inserts
   * is acceptable for a browse surface and self-heals on the next full load.
   */
  async row(q: CatalogueRowQuery) {
    const where = this.buildWhere(q);
    const orderBy = this.buildOrder(q);
    const offset = this.decodeRowCursor(q.cursor);
    // Over-fetch by one to detect whether a further page exists without a count.
    const rows = (await this.prisma.listing.findMany({
      where,
      orderBy,
      skip: offset,
      take: q.limit + 1,
      include: this.include(),
    })) as FullListing[];

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    return {
      category: q.category,
      items: page.map((l) => this.toCardV2(l)),
      nextCursor: hasMore ? String(offset + q.limit) : null,
      exhausted: !hasMore,
    };
  }

  /** Decode the opaque row cursor to a non-negative offset (invalid → start). */
  private decodeRowCursor(cursor: string | undefined): number {
    if (!cursor) return 0;
    const n = Number.parseInt(cursor, 10);
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  }

  async get(listingId: string) {
    // FIX-01 — public single-lot privacy. A public caller may only resolve a
    // listing that is in a PUBLIC status. Draft/submitted/review/approved/
    // withdrawn/unsold listings return 404 (not "forbidden", which would confirm
    // existence). Authorized staff detail belongs on a separate guarded path.
    const listing = (await this.prisma.listing.findFirst({
      where: { id: listingId, status: { in: [...PUBLIC_STATUSES] as never } },
      include: this.include(),
    })) as FullListing | null;
    if (!listing) throw new NotFoundException('Lot not found');

    const card = this.toCardV2(listing);
    return {
      ...card,
      fullDescription: listing.fullDescription,
      inspectionSummary: listing.inspectionSummary,
      collectionSummary: listing.collectionSummary,
      publicTermsRef: listing.publicTermsRef,
      attributes: listing.asset.attributes,
      media: this.mediaList(listing),
      event: listing.eventLots[0]
        ? this.eventSummary(listing.eventLots[0].event, listing.eventLots[0].sequence)
        : null,
    };
  }

  // --- query building -------------------------------------------------------

  private buildWhere(q: CatalogueFilters): Prisma.ListingWhereInput {
    const and: Prisma.ListingWhereInput[] = [
      { status: { in: (q.status ? [q.status] : [...OPEN_STATUSES]) as never } },
    ];
    if (q.category) and.push({ asset: { category: q.category } });
    if (q.saleMethod) and.push({ saleMethod: q.saleMethod });
    if (q.featured) and.push({ featured: true });
    if (q.auctionEventId) and.push({ eventLots: { some: { auctionEventId: q.auctionEventId } } });
    if (q.location)
      and.push({
        OR: [
          { locationCity: { contains: q.location, mode: 'insensitive' } },
          { locationRegion: { contains: q.location, mode: 'insensitive' } },
        ],
      });
    if (q.search)
      and.push({
        OR: [
          { title: { contains: q.search, mode: 'insensitive' } },
          { publicRef: { contains: q.search, mode: 'insensitive' } },
          { shortDescription: { contains: q.search, mode: 'insensitive' } },
          { asset: { category: { contains: q.search, mode: 'insensitive' } } },
        ],
      });
    if (q.endingSoon)
      and.push({ auction: { endsAt: { lte: new Date(Date.now() + 48 * 3_600_000) } } });
    // RW4 — price BAND: match whichever commercial figure a listing actually publishes (buy-now /
    // unit / guide / live-or-opening bid). An OR keeps heterogeneous sale methods comparable
    // without inventing a single cross-method price (mirrors the buildOrder price-sort caveat).
    if (q.minPriceMinor != null || q.maxPriceMinor != null) {
      const range: { gte?: bigint; lte?: bigint } = {};
      if (q.minPriceMinor != null) range.gte = BigInt(q.minPriceMinor);
      if (q.maxPriceMinor != null) range.lte = BigInt(q.maxPriceMinor);
      and.push({
        OR: [
          { buyNowPriceMinor: range },
          { unitPriceMinor: range },
          { guidePriceMinor: range },
          { auction: { is: { currentBidMinor: range } } },
          { auction: { is: { openingBidMinor: range } } },
        ],
      });
    }
    if (q.minQuantity != null || q.maxQuantity != null) {
      const qty: { gte?: number; lte?: number } = {};
      if (q.minQuantity != null) qty.gte = q.minQuantity;
      if (q.maxQuantity != null) qty.lte = q.maxQuantity;
      and.push({ quantityAvailable: qty });
    }
    if (q.unit) and.push({ quantityUnitCode: q.unit });
    if (q.pickup) and.push({ pickupLocationId: { not: null } });
    if (q.delivery) and.push({ destinationLocationId: { not: null } });
    return { AND: and };
  }

  /**
   * Sale-aware, cursor-stable ordering (pack 01 doc 05). Price sorting is
   * meaningful only relative to a sale method, so when a single `saleMethod` is
   * selected we sort by THAT method's commercial figure — auctions by live/
   * opening bid, Buy Now by its price, everything else by the public guide.
   * Without a sale-method filter, "price" has no single comparable across
   * heterogeneous methods, so we fall back to recency (documented in TEST_MATRIX).
   * Every branch ends with `id: 'desc'` so cursor pagination is deterministic.
   */
  private buildOrder(
    q: CatalogueFilters & { sort: CatalogueQuery['sort'] },
  ): Prisma.ListingOrderByWithRelationInput[] {
    const id = { id: 'desc' as const };
    if (q.sort === 'ending')
      // Ending Soon (V3 default, pack doc 08): deadline-aware across sale methods.
      // Timed auctions order by their (soft-close-extended) `endsAt`; non-auction
      // methods (EOI/tender/offer/Buy-Now window) order by the listing `closesAt`.
      // Auctions with no relation and lots with no deadline fall last (nulls last)
      // and are broken by recency, then `id` for cursor-stable determinism.
      return [
        { auction: { endsAt: 'asc' } },
        { closesAt: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
        id,
      ];
    if (q.sort === 'price_asc' || q.sort === 'price_desc') {
      const dir = q.sort === 'price_asc' ? ('asc' as const) : ('desc' as const);
      switch (q.saleMethod) {
        case 'TIMED_AUCTION':
        case 'LIVE_HYBRID':
          // currentBid falls back to openingBid at the DB via coalesce-like
          // secondary key; nulls (no auction) sort last.
          return [{ auction: { currentBidMinor: dir } }, { auction: { openingBidMinor: dir } }, id];
        case 'BUY_NOW':
          return [{ buyNowPriceMinor: dir }, id];
        default:
          return [{ guidePriceMinor: dir }, id];
      }
    }
    return [{ createdAt: 'desc' }, id];
  }

  private include() {
    return {
      asset: { include: { media: true } },
      auction: true,
      eventLots: { include: { event: true } },
      _count: { select: { watches: true, eois: true, offers: true, tenderBids: true } },
    } satisfies Prisma.ListingInclude;
  }

  // --- DTO assembly ---------------------------------------------------------

  private toCardV2(l: FullListing) {
    return {
      id: l.id,
      reference: l.publicRef,
      title: l.title ?? l.asset.category,
      shortDescription: l.shortDescription ?? undefined,
      category: l.asset.category,
      location:
        l.locationCity || l.locationRegion
          ? { city: l.locationCity, region: l.locationRegion }
          : undefined,
      saleMethod: l.saleMethod,
      status: l.status,
      featured: l.featured,
      watchers: l._count.watches,
      // RW4 — customer-safe card hints (never internal/private fields). Quantity is a Decimal, so
      // it is projected as a string (no precision loss) to match the frontend's declared shape.
      quantity: l.quantityAvailable == null ? undefined : l.quantityAvailable.toString(),
      quantityUnitCode: l.quantityUnitCode ?? undefined,
      pickupAvailable: l.pickupLocationId != null,
      deliveryAvailable: l.destinationLocationId != null,
      media: this.coverMedia(l),
      commercial: this.commercial(l),
      event: l.eventLots[0]
        ? this.eventSummary(l.eventLots[0].event, l.eventLots[0].sequence)
        : undefined,
    };
  }

  /** Sale-aware discriminated commercial payload (doc 07). */
  private commercial(l: FullListing) {
    const guide =
      l.showGuidePrice && l.guidePriceMinor != null ? Number(l.guidePriceMinor) : undefined;
    switch (l.saleMethod) {
      case 'TIMED_AUCTION':
      case 'LIVE_HYBRID':
        return {
          kind: 'auction' as const,
          currency: l.auction?.currency ?? l.currency,
          openingBidMinor: l.auction ? Number(l.auction.openingBidMinor) : null,
          currentBidMinor: l.auction
            ? Number(l.auction.currentBidMinor ?? l.auction.openingBidMinor)
            : null,
          endsAt: l.auction?.endsAt ?? null,
          extendedCount: l.auction?.extendedCount ?? 0,
        };
      case 'EXPRESSION_OF_INTEREST':
        return {
          kind: 'eoi' as const,
          currency: l.currency,
          guidePriceMinor: guide,
          interestCount: l._count.eois,
          closesAt: l.closesAt ?? null,
        };
      case 'BUY_NOW':
        return {
          kind: 'buy_now' as const,
          currency: l.currency,
          priceMinor: l.buyNowPriceMinor != null ? Number(l.buyNowPriceMinor) : null,
        };
      case 'MAKE_OFFER':
        return {
          kind: 'make_offer' as const,
          currency: l.currency,
          guidePriceMinor: guide,
          offerCount: l._count.offers,
        };
      case 'SEALED_TENDER':
        return {
          kind: 'sealed_tender' as const,
          currency: l.currency,
          guidePriceMinor: guide,
          submissionCount: l._count.tenderBids,
          closesAt: l.closesAt ?? null,
        };
      default:
        return { kind: 'unknown' as const, currency: l.currency };
    }
  }

  /**
   * FIX-02 — the single source of truth for "media a public caller may see".
   * Internal/private (`visibility !== 'public'`) and not-ready
   * (uploading/processing/failed/archived) media never appear publicly, so a
   * private or still-processing object can never leak as a cover, gallery frame
   * or `videoAvailable` signal.
   */
  private publicReady<T extends { visibility: string; status: string }>(media: T[]): T[] {
    return media.filter((m) => m.visibility === 'public' && m.status === 'ready');
  }

  private coverMedia(l: FullListing) {
    const media = this.publicReady(l.asset.media ?? []);
    const images = media.filter((m) => m.kind === 'image');
    const cover = images.find((m) => m.isCover) ?? images[0];
    return {
      cover: cover ? this.publicMedia(cover) : undefined,
      videoAvailable: media.some((m) => m.kind === 'video'),
    };
  }

  private mediaList(l: FullListing) {
    // Gallery = public-ready visual media only; documents have their own
    // authorized access path and never render in the public gallery.
    return this.publicReady(l.asset.media ?? [])
      .filter((m) => m.kind !== 'document')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => this.publicMedia(m));
  }

  private publicMedia(m: {
    id: string;
    kind: string;
    storageKey: string;
    caption: string | null;
    width: number | null;
    height: number | null;
  }) {
    return {
      id: m.id,
      kind: m.kind,
      storageKey: m.storageKey,
      caption: m.caption ?? undefined,
      width: m.width ?? undefined,
      height: m.height ?? undefined,
    };
  }

  private eventSummary(
    e: { id: string; publicRef: string; title: string; eventType: string; status: string },
    sequence: number,
  ) {
    return {
      id: e.id,
      publicRef: e.publicRef,
      title: e.title,
      eventType: e.eventType,
      status: e.status,
      lotSequence: sequence,
    };
  }
}
