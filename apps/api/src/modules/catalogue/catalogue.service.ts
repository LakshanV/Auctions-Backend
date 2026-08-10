import { Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';

type ListingWithAuction = Prisma.ListingGetPayload<{ include: { asset: true; auction: true } }>;

/**
 * Public catalogue reads for the website. Privacy-safe: never exposes reserve,
 * leader identity or proxy maxima (docs/13, docs/15).
 */
@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const listings = await this.prisma.listing.findMany({
      where: { status: { in: ['scheduled', 'live'] } },
      orderBy: { createdAt: 'desc' },
      take: 48,
      include: { asset: true, auction: true },
    });
    return listings.map((l) => this.toCard(l));
  }

  async get(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { asset: true, auction: true },
    });
    if (!listing) throw new NotFoundException('Lot not found');
    return {
      ...this.toCard(listing),
      attributes: listing.asset.attributes,
      auction: listing.auction
        ? {
            id: listing.auction.id,
            status: listing.auction.status,
            currency: listing.auction.currency,
            openingBidMinor: Number(listing.auction.openingBidMinor),
            incrementMinor: Number(listing.auction.incrementMinor),
            currentBidMinor:
              listing.auction.currentBidMinor == null
                ? null
                : Number(listing.auction.currentBidMinor),
            startsAt: listing.auction.startsAt,
            endsAt: listing.auction.endsAt,
          }
        : null,
    };
  }

  private toCard(l: ListingWithAuction) {
    return {
      id: l.id,
      reference: l.publicRef,
      title: l.title ?? l.asset.category,
      category: l.asset.category,
      saleMethod: l.saleMethod,
      status: l.status,
      auctionId: l.auction?.id ?? null,
      auctionStatus: l.auction?.status ?? null,
      currency: l.auction?.currency ?? 'LKR',
      currentBidMinor: l.auction
        ? Number(l.auction.currentBidMinor ?? l.auction.openingBidMinor)
        : null,
      endsAt: l.auction?.endsAt ?? null,
    };
  }
}
