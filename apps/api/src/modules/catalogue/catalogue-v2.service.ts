import { Injectable, NotFoundException } from '@nestjs/common';
import { type CatalogueQuery } from '@singha/contracts';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';

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

  async get(listingId: string) {
    const listing = (await this.prisma.listing.findUnique({
      where: { id: listingId },
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

  private buildWhere(q: CatalogueQuery): Prisma.ListingWhereInput {
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

  private buildOrder(q: CatalogueQuery): Prisma.ListingOrderByWithRelationInput {
    switch (q.sort) {
      case 'ending':
        return { auction: { endsAt: 'asc' } };
      case 'price_asc':
        return { guidePriceMinor: 'asc' };
      case 'price_desc':
        return { guidePriceMinor: 'desc' };
      default:
        return { createdAt: 'desc' };
    }
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

  private coverMedia(l: FullListing) {
    const media = l.asset.media ?? [];
    const cover = media.find((m) => m.isCover) ?? media.find((m) => m.kind === 'image');
    return {
      cover: cover ? this.publicMedia(cover) : undefined,
      videoAvailable: media.some((m) => m.kind === 'video'),
    };
  }

  private mediaList(l: FullListing) {
    return (l.asset.media ?? [])
      .filter((m) => m.visibility === 'public')
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
