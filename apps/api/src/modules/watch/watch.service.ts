import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId } from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { type Principal } from '../../shared/auth/principal';

/**
 * Authoritative watchlist (consolidated pack doc 06). Replaces the frontend's
 * localStorage-only list: one row per (customer, listing), server-owned so it
 * follows the buyer across devices and powers the command-centre projection.
 */
@Injectable()
export class WatchService {
  constructor(private readonly prisma: PrismaService) {}

  private customer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  async add(principal: Principal, listingId: string) {
    const customerId = this.customer(principal);
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    await this.prisma.watch.upsert({
      where: { customerId_listingId: { customerId, listingId } },
      update: {},
      create: { id: newId(), customerId, listingId },
    });
    return { listingId, watching: true };
  }

  async remove(principal: Principal, listingId: string) {
    const customerId = this.customer(principal);
    await this.prisma.watch
      .delete({ where: { customerId_listingId: { customerId, listingId } } })
      .catch(() => undefined);
    return { listingId, watching: false };
  }

  /** The caller's watched lots, with live sale-aware summary. */
  async mine(principal: Principal) {
    const customerId = this.customer(principal);
    const rows = await this.prisma.watch.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { listing: { include: { asset: true, auction: true } } },
    });
    return rows.map((w) => ({
      listingId: w.listingId,
      reference: w.listing.publicRef,
      title: w.listing.title ?? w.listing.asset.category,
      category: w.listing.asset.category,
      saleMethod: w.listing.saleMethod,
      status: w.listing.status,
      currency: w.listing.currency,
      currentBidMinor: w.listing.auction
        ? Number(w.listing.auction.currentBidMinor ?? w.listing.auction.openingBidMinor)
        : null,
      endsAt: w.listing.auction?.endsAt ?? w.listing.closesAt ?? null,
      watchedAt: w.createdAt,
    }));
  }

  /** Public watcher count for a listing (social proof; no identities). */
  async countFor(listingId: string) {
    const count = await this.prisma.watch.count({ where: { listingId } });
    return { listingId, watchers: count };
  }
}
