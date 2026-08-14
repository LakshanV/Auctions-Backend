import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type SaleWithCategory = {
  amountMinor: bigint;
  currency: string;
  channel: string;
  createdAt: Date;
  listing: { asset: { category: string } };
};

/**
 * Singha Asset Intelligence (docs/12). DERIVED analytics only — read models over
 * the authoritative Sale/Bid/Listing data; never a source of truth. Powers the
 * homepage Market Pulse (rule 13) plus comparables and seller intelligence.
 */
@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Homepage Market Pulse: sold volume/value by category over a window. */
  async marketPulse(days = 90) {
    const since = new Date(Date.now() - days * 86_400_000);
    const sales = (await this.prisma.sale.findMany({
      where: { createdAt: { gte: since } },
      include: { listing: { include: { asset: true } } },
    })) as unknown as SaleWithCategory[];

    const byCategory = new Map<string, { salesCount: number; totalMinor: number }>();
    let totalMinor = 0;
    for (const s of sales) {
      const cat = s.listing.asset.category;
      const amt = Number(s.amountMinor);
      totalMinor += amt;
      const row = byCategory.get(cat) ?? { salesCount: 0, totalMinor: 0 };
      row.salesCount += 1;
      row.totalMinor += amt;
      byCategory.set(cat, row);
    }
    const categories = [...byCategory.entries()]
      .map(([category, v]) => ({
        category,
        salesCount: v.salesCount,
        totalMinor: v.totalMinor,
        avgMinor: v.salesCount ? Math.round(v.totalMinor / v.salesCount) : 0,
      }))
      .sort((a, b) => b.totalMinor - a.totalMinor);

    const sellThrough = await this.sellThrough(since);

    return { windowDays: days, salesCount: sales.length, totalMinor, categories, sellThrough };
  }

  /**
   * Sell-through = soldCount / offeredCount over a window: what fraction of
   * auction lots that came up for sale actually sold, vs. passed in (closed
   * with no winner). Computed LIVE from the durable outcome auction.service's
   * close() already records on every Auction row — never materialized, no
   * migration. AUCTION_PASSED_IN is audited per lot (auction.service.ts) but
   * never aggregated anywhere, and Listing.status's 'unsold' value is defined
   * in the schema/lifecycle but close() never actually sets it on the
   * passed-in path — so neither is a reliable signal here. Auction IS
   * reliable: close() unconditionally sets status='closed' and ONLY sets
   * winnerCustomerId when the lot sold (see auction.service.ts#close), for
   * every closed auction, sold or not. There is no `closedAt` column, so
   * `updatedAt` is used as its proxy — a closed auction is never updated again
   * by any current code path (open()/bid placement both require status
   * ==='open', which close() has already left).
   */
  private async sellThrough(since: Date): Promise<{
    soldCount: number;
    offeredCount: number;
    ratio: number | null;
  }> {
    const [soldCount, notSoldCount] = await Promise.all([
      this.prisma.auction.count({
        where: { status: 'closed', updatedAt: { gte: since }, winnerCustomerId: { not: null } },
      }),
      this.prisma.auction.count({
        where: { status: 'closed', updatedAt: { gte: since }, winnerCustomerId: null },
      }),
    ]);
    const offeredCount = soldCount + notSoldCount;
    return { soldCount, offeredCount, ratio: offeredCount === 0 ? null : soldCount / offeredCount };
  }

  /** Recent comparable sales for a category → suggested price range. */
  async comparables(category: string, limit = 10) {
    const sales = (await this.prisma.sale.findMany({
      where: { listing: { asset: { category } } },
      include: { listing: { include: { asset: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
    })) as unknown as (SaleWithCategory & {
      listing: { publicRef: string; asset: { category: string } };
    })[];

    const amounts = sales.map((s) => Number(s.amountMinor)).sort((a, b) => a - b);
    const range =
      amounts.length === 0
        ? null
        : {
            minMinor: amounts[0],
            medianMinor: amounts[Math.floor(amounts.length / 2)],
            maxMinor: amounts[amounts.length - 1],
          };
    return {
      category,
      count: sales.length,
      suggestedRange: range,
      comparables: sales.map((s) => ({
        publicRef: s.listing.publicRef,
        channel: s.channel,
        amountMinor: Number(s.amountMinor),
        currency: s.currency,
        soldAt: s.createdAt,
      })),
    };
  }

  /** Price/demand insight for one asset, from its category comparables. */
  async assetInsights(assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    const comps = await this.comparables(asset.category, 10);
    return { assetId, ...comps };
  }

  /** Seller intelligence: an organisation's sold performance. */
  async sellerIntelligence(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    // Assets owned by org members → their sold listings.
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
    });
    const ownerIds = members.map((m) => m.customerId);
    const sales = (await this.prisma.sale.findMany({
      where: { listing: { asset: { ownerCustomerId: { in: ownerIds } } } },
      include: { listing: { include: { asset: true } } },
    })) as unknown as SaleWithCategory[];
    const totalMinor = sales.reduce((sum, s) => sum + Number(s.amountMinor), 0);
    return {
      organizationId: orgId,
      salesCount: sales.length,
      totalMinor,
      avgMinor: sales.length ? Math.round(totalMinor / sales.length) : 0,
    };
  }
}
