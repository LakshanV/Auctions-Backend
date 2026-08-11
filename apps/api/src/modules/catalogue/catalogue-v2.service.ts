import { Injectable, NotFoundException } from '@nestjs/common';
import { type CatalogueQuery, type CatalogueRowQuery } from '@singha/contracts';
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

    const [total, rows, categoryFacet, saleMethodFacet] = await Promise.all([
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
    ]);

    // Category facet needs a join to asset — group in JS from a light query.
    const catRows = await this.prisma.listing.findMany({
      where,
      select: { asset: { select: { category: true } } },
    });
    const categoryCounts = new Map<string, number>();
    for (const r of catRows)
      categoryCounts.set(r.asset.category, (categoryCounts.get(r.asset.category) ?? 0) + 1);

    return {
      items: rows.map((l) => this.toCardV2(l as FullListing)),
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
      facets: {
        category: [...categoryCounts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
        saleMethod: saleMethodFacet.map((f) => ({ value: f.saleMethod, count: f._count })),
        status: (categoryFacet as { status: string; _count: number }[]).map((f) => ({
          value: f.status,
          count: f._count,
        })),
      },
    };
  }

  /**
   * One AuctionFlow/Rubik category row, cursor-paginated (pack 01 doc 05). The
   * row owns its own cursor so bands page independently and every category is
   * reachable — not just the first global page. Ordering is stable (id
   * tiebreaker) so appending a page never reshuffles already-shown faces.
   */
  async row(q: CatalogueRowQuery) {
    const where = this.buildWhere(q);
    const orderBy = this.buildOrder(q);
    // Over-fetch by one to detect whether a further page exists without a count.
    const rows = (await this.prisma.listing.findMany({
      where,
      orderBy,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: this.include(),
    })) as FullListing[];

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    return {
      category: q.category,
      items: page.map((l) => this.toCardV2(l)),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
      exhausted: !hasMore,
    };
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
      { status: { in: (q.status ? [q.status] : [...PUBLIC_STATUSES]) as never } },
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
    if (q.sort === 'ending') return [{ auction: { endsAt: 'asc' } }, id];
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
