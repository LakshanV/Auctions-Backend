import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, type RecordDiscoveryEventInput } from '@singha/contracts';
import { buildBuyerTwinProjection, type DiscoverySignal, toBuyerTwinSummary } from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { type Principal } from '../../shared/auth/principal';

const OPEN_STATUSES = ['scheduled', 'live'] as const;
const SEEN_TYPES = ['OPEN', 'DISLIKE', 'PURCHASE', 'BID', 'OFFER', 'EOI'];
const REBUILD_LIMIT = 2000; // cap signals per rebuild (recent-first)
const DIVERSITY_CAP = 3; // max lots per category in one feed page

type ListingForSignal = {
  asset: { category: string };
  saleMethod: string;
  guidePriceMinor: bigint | null;
  buyNowPriceMinor: bigint | null;
  auction: { currentBidMinor: bigint | null; openingBidMinor: bigint } | null;
};

function priceOf(l: ListingForSignal): number | null {
  const v =
    l.auction?.currentBidMinor ??
    l.auction?.openingBidMinor ??
    l.guidePriceMinor ??
    l.buyNowPriceMinor ??
    null;
  return v == null ? null : Number(v);
}

/**
 * Singha Discover + Buyer Twin service (pack docs 06/11). Records the append-only
 * DiscoveryEvent ledger, rebuilds the Buyer Twin projection from it via the pure
 * domain engine (Tier-A weights stay in the engine), serves a safe summary + a
 * simple server-ranked feed, and resets PREFERENCE data without touching any
 * financial/audit record.
 */
@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  private requireCustomer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  /** Append a discovery signal (customer or anonymous). Never a bid/purchase itself. */
  async recordEvent(principal: Principal, input: RecordDiscoveryEventInput) {
    const listing = await this.prisma.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    await this.prisma.discoveryEvent.create({
      data: {
        id: newId(),
        customerId: principal.customerId ?? null,
        anonymousSessionId: input.anonymousSessionId ?? null,
        listingId: input.listingId,
        eventType: input.eventType,
        sourceSurface: input.sourceSurface,
        bandContext: input.bandContext ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
    return { recorded: true };
  }

  /** Rebuild the caller's projection from the ledger and return the SAFE summary. */
  async myBuyerTwin(principal: Principal) {
    const customerId = this.requireCustomer(principal);
    const events = await this.prisma.discoveryEvent.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: REBUILD_LIMIT,
      include: {
        listing: {
          select: {
            saleMethod: true,
            guidePriceMinor: true,
            buyNowPriceMinor: true,
            asset: { select: { category: true } },
            auction: { select: { currentBidMinor: true, openingBidMinor: true } },
          },
        },
      },
    });

    const signals: DiscoverySignal[] = events.map((e) => ({
      type: e.eventType as DiscoverySignal['type'],
      category: e.listing.asset.category,
      priceMinor: priceOf(e.listing as ListingForSignal),
      saleMethod: e.listing.saleMethod,
    }));

    const projection = buildBuyerTwinProjection(signals);
    // Cache the (Tier-A) projection for the feed ranker; never served raw.
    await this.prisma.buyerTwinProjection.upsert({
      where: { customerId },
      update: {
        version: projection.version,
        data: projection as unknown as object,
        builtAt: new Date(projection.builtAt),
        signalCount: projection.signalCount,
      },
      create: {
        customerId,
        version: projection.version,
        data: projection as unknown as object,
        builtAt: new Date(projection.builtAt),
        signalCount: projection.signalCount,
      },
    });

    return toBuyerTwinSummary(projection);
  }

  /**
   * Reset discovery PREFERENCES: delete the customer's DiscoveryEvent ledger + the
   * projection cache. Financial/audit records (bids, payments, watches, offers) are
   * NOT touched (pack doc 06 "reset preferences without deleting financial records").
   */
  async resetPreferences(principal: Principal) {
    const customerId = this.requireCustomer(principal);
    await this.prisma.discoveryEvent.deleteMany({ where: { customerId } });
    await this.prisma.buyerTwinProjection.deleteMany({ where: { customerId } });
    return { reset: true };
  }

  /**
   * A simple, deterministic Discover feed (pack doc 11): unseen active inventory,
   * Ending Soon first, boosted by the customer's top affinities, with a diversity
   * cap. Ranking stays server-side. Anonymous callers get the ending-soon slice.
   */
  async feed(principal: Principal, limit = 20) {
    // Candidate open inventory, soonest-ending first.
    const candidates = await this.prisma.listing.findMany({
      where: { status: { in: [...OPEN_STATUSES] as never } },
      orderBy: [
        { auction: { endsAt: 'asc' } },
        { closesAt: { sort: 'asc', nulls: 'last' } },
        { id: 'desc' },
      ],
      take: 120,
      include: {
        asset: { select: { category: true, media: { take: 1, orderBy: { createdAt: 'asc' } } } },
        auction: { select: { currentBidMinor: true, openingBidMinor: true, endsAt: true } },
      },
    });

    let seen = new Set<string>();
    let topCategories: string[] = [];
    if (principal.customerId) {
      const [seenEvents, twin] = await Promise.all([
        this.prisma.discoveryEvent.findMany({
          where: { customerId: principal.customerId, eventType: { in: SEEN_TYPES } },
          select: { listingId: true },
        }),
        this.prisma.buyerTwinProjection.findUnique({ where: { customerId: principal.customerId } }),
      ]);
      seen = new Set(seenEvents.map((e) => e.listingId));
      const data = twin?.data as { categoryAffinities?: { category: string }[] } | undefined;
      topCategories = (data?.categoryAffinities ?? []).slice(0, 3).map((a) => a.category);
    }

    const unseen = candidates.filter((l) => !seen.has(l.id));
    // Stable affinity partition: affinity-category lots first (still ending-soon order).
    const affinity = unseen.filter((l) => topCategories.includes(l.asset.category));
    const rest = unseen.filter((l) => !topCategories.includes(l.asset.category));
    const ordered = [...affinity, ...rest];

    // Diversity guard — cap lots per category so the feed never collapses to one type.
    const perCat = new Map<string, number>();
    const picked: typeof ordered = [];
    for (const l of ordered) {
      const n = perCat.get(l.asset.category) ?? 0;
      if (n >= DIVERSITY_CAP) continue;
      perCat.set(l.asset.category, n + 1);
      picked.push(l);
      if (picked.length >= limit) break;
    }

    return {
      items: picked.map((l) => ({
        listingId: l.id,
        reference: l.publicRef,
        title: l.title ?? l.asset.category,
        category: l.asset.category,
        saleMethod: l.saleMethod,
        currency: l.currency,
        currentBidMinor: l.auction
          ? Number(l.auction.currentBidMinor ?? l.auction.openingBidMinor)
          : null,
        endsAt: l.auction?.endsAt ?? l.closesAt ?? null,
        coverStorageKey: l.asset.media[0]?.storageKey ?? null,
        reason: topCategories.includes(l.asset.category)
          ? `Because you follow ${l.asset.category}`
          : null,
      })),
    };
  }
}
