import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type AddEventLotInput, type CreateAuctionEventInput, newId } from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

/**
 * Auction events (consolidated pack doc 06): a curated container ABOVE
 * individual lots — physical/live multi-lot events, sequential/group timed
 * sales, event pages, ordered lot queues. Individual Auction/Bid records remain
 * authoritative; an event only groups + sequences listings.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {}

  async create(principal: Principal, input: CreateAuctionEventInput) {
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const event = await ctx.tx.auctionEvent.create({
        data: {
          id,
          publicRef: input.publicRef,
          title: input.title,
          description: input.description,
          eventType: input.eventType,
          status: 'draft',
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          venue: input.venue,
          locationCity: input.locationCity,
          liveEnabled: input.liveEnabled,
          featured: input.featured,
        },
      });
      ctx.audit({ action: 'AUCTION_EVENT_CREATED', targetType: 'AuctionEvent', targetId: id });
      return this.summary(event);
    });
  }

  async addLot(principal: Principal, eventId: string, input: AddEventLotInput) {
    const event = await this.prisma.auctionEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    const listing = await this.prisma.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    const clash = await this.prisma.auctionEventLot.findFirst({
      where: {
        auctionEventId: eventId,
        OR: [{ listingId: input.listingId }, { sequence: input.sequence }],
      },
    });
    if (clash) throw new ConflictException('Lot or sequence already used in this event');

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.auctionEventLot.create({
        data: {
          id: newId(),
          auctionEventId: eventId,
          listingId: input.listingId,
          sequence: input.sequence,
          lane: input.lane,
          scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : null,
        },
      });
      ctx.audit({
        action: 'AUCTION_EVENT_LOT_ADDED',
        targetType: 'AuctionEvent',
        targetId: eventId,
      });
      return { eventId, listingId: input.listingId, sequence: input.sequence };
    });
  }

  async publish(principal: Principal, eventId: string) {
    const event = await this.prisma.auctionEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.auctionEvent.update({
        where: { id: eventId },
        data: { status: 'scheduled' },
      });
      ctx.audit({
        action: 'AUCTION_EVENT_PUBLISHED',
        targetType: 'AuctionEvent',
        targetId: eventId,
      });
      return this.summary(updated);
    });
  }

  /** Public list of events (featured filter optional). */
  async list(featuredOnly: boolean) {
    const rows = await this.prisma.auctionEvent.findMany({
      where: {
        status: { in: ['scheduled', 'live', 'ended'] },
        ...(featuredOnly ? { featured: true } : {}),
      },
      orderBy: [{ featured: 'desc' }, { startsAt: 'asc' }],
      include: { _count: { select: { lots: true } } },
    });
    return rows.map((e) => ({ ...this.summary(e), lotCount: e._count.lots }));
  }

  /** Public event page: the event + its ordered public lots. */
  async get(idOrRef: string) {
    const event = await this.prisma.auctionEvent.findFirst({
      where: { OR: [{ id: idOrRef }, { publicRef: idOrRef }] },
      include: {
        lots: {
          orderBy: { sequence: 'asc' },
          include: { listing: { include: { asset: true, auction: true } } },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return {
      ...this.summary(event),
      description: event.description,
      venue: event.venue,
      lots: event.lots
        .filter((l) => ['scheduled', 'live', 'ended', 'sold'].includes(l.listing.status))
        .map((l) => ({
          sequence: l.sequence,
          lane: l.lane,
          scheduledStart: l.scheduledStart,
          listingId: l.listingId,
          reference: l.listing.publicRef,
          title: l.listing.title ?? l.listing.asset.category,
          category: l.listing.asset.category,
          saleMethod: l.listing.saleMethod,
          currentBidMinor: l.listing.auction
            ? Number(l.listing.auction.currentBidMinor ?? l.listing.auction.openingBidMinor)
            : null,
        })),
    };
  }

  private summary(e: {
    id: string;
    publicRef: string;
    title: string;
    eventType: string;
    status: string;
    startsAt: Date | null;
    venue?: string | null;
    locationCity?: string | null;
    liveEnabled: boolean;
    featured: boolean;
  }) {
    return {
      id: e.id,
      publicRef: e.publicRef,
      title: e.title,
      eventType: e.eventType,
      status: e.status,
      startsAt: e.startsAt,
      locationCity: e.locationCity ?? null,
      liveEnabled: e.liveEnabled,
      featured: e.featured,
    };
  }
}
