import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateLiveEventInput,
  DomainEventName,
  type FloorBidInput,
  newId,
} from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { makePrincipal, type Principal } from '../../shared/auth/principal';
import { AuctionService } from '../auction/auction.service';
import { LIVE_PROVIDER, type LiveStreamProvider } from './live.provider';

/**
 * Singha Live (docs/08). The auction engine stays authoritative (rule 12): the
 * broadcast is a distribution surface. Floor/phone/absentee bids relayed by a
 * clerk go through the SAME row-locked engine into the ONE bid ledger. Ingest/
 * simulcast run through a provider adapter (mock until IVS/YouTube access).
 */
@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly auctions: AuctionService,
    @Inject(LIVE_PROVIDER) private readonly stream: LiveStreamProvider,
  ) {}

  async createEvent(principal: Principal, input: CreateLiveEventInput) {
    const channel = await this.stream.createChannel(input.title);
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const event = await ctx.tx.liveEvent.create({
        data: {
          id,
          auctionId: input.auctionId,
          title: input.title,
          status: 'scheduled',
          ingestProvider: this.stream.name,
          ingestUrl: channel.ingestUrl,
          playbackUrl: channel.playbackUrl,
        },
      });
      ctx.audit({ action: 'LIVE_EVENT_CREATED', targetType: 'LiveEvent', targetId: id });
      return this.view(event);
    });
  }

  async start(principal: Principal, id: string) {
    const event = await this.require(id);
    if (event.status === 'live') return this.view(event);
    if (event.status === 'ended') throw new ConflictException('Event already ended');
    await this.stream.startBroadcast(id);
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.liveEvent.update({
        where: { id },
        data: { status: 'live', startedAt: new Date() },
      });
      ctx.emit({
        name: DomainEventName.LiveBroadcastStarted,
        aggregateType: 'LiveEvent',
        aggregateId: id,
        payload: { liveEventId: id, auctionId: event.auctionId },
      });
      ctx.audit({ action: 'LIVE_BROADCAST_STARTED', targetType: 'LiveEvent', targetId: id });
      return this.view(updated);
    });
  }

  /** Start a YouTube (mock) simulcast — a distribution surface only (rule 12). */
  async simulcast(principal: Principal, id: string) {
    const event = await this.require(id);
    if (event.status !== 'live') throw new ConflictException('Event is not live');
    const { simulcastUrl } = await this.stream.startSimulcast(id);
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.liveEvent.update({ where: { id }, data: { simulcastUrl } });
      ctx.audit({ action: 'LIVE_SIMULCAST_STARTED', targetType: 'LiveEvent', targetId: id });
      return this.view(updated);
    });
  }

  async stop(principal: Principal, id: string) {
    const event = await this.require(id);
    if (event.status === 'ended') return this.view(event);
    const { recordingUrl } = await this.stream.stopBroadcast(id);
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.liveEvent.update({
        where: { id },
        data: { status: 'ended', endedAt: new Date(), recordingUrl },
      });
      ctx.emit({
        name: DomainEventName.LiveBroadcastEnded,
        aggregateType: 'LiveEvent',
        aggregateId: id,
        payload: { liveEventId: id, recordingUrl },
      });
      ctx.audit({ action: 'LIVE_BROADCAST_ENDED', targetType: 'LiveEvent', targetId: id });
      return this.view(updated);
    });
  }

  /**
   * Clerk relays a floor/phone bid on behalf of a registered bidder. It goes
   * through the authoritative auction engine (same validation + row lock) — the
   * bid's actor/source reflect the real bidder, not the clerk.
   */
  async floorBid(clerk: Principal, input: FloorBidInput) {
    const bidder = await this.prisma.customer.findUnique({ where: { id: input.bidderCustomerId } });
    if (!bidder) throw new NotFoundException('Bidder not found');
    // Synthesize the bidder's principal — server-authoritative, clerk-initiated.
    const bidderPrincipal = makePrincipal(input.bidderCustomerId, ['customer']);
    const result = await this.auctions.placeBid(bidderPrincipal, input.auctionId, {
      maxAmountMinor: input.maxAmountMinor,
      source: input.source,
      idempotencyKey: `floor-${newId()}`,
    });
    // Audit the clerk relay action separately.
    await this.uow.execute(toActor(clerk), async (ctx) => {
      ctx.audit({
        action: 'LIVE_FLOOR_BID_RELAYED',
        targetType: 'Auction',
        targetId: input.auctionId,
        after: { bidder: input.bidderCustomerId, source: input.source },
      });
    });
    return { relayedBy: clerk.customerId ?? 'clerk', source: input.source, ...result };
  }

  async get(id: string) {
    return this.view(await this.require(id));
  }

  /**
   * The canonical live-room projection (pack doc 08): broadcast status + video
   * availability + the AUTHORITATIVE current bid state from the auction engine. Bid state
   * is read from the engine, NOT a separate live-bid store, so a video/stream outage can
   * never corrupt bidding — `videoAvailable` may be false while `bid` keeps updating.
   * `seq` is the auction engine's monotonic version, for realtime ordering/dedupe.
   */
  async liveRoom(id: string) {
    const event = await this.require(id);
    const bid = event.auctionId
      ? await this.auctions.getState(event.auctionId).catch(() => null)
      : null;
    return {
      ...this.view(event),
      videoAvailable: event.status === 'live' && !!event.playbackUrl,
      bid,
      seq: bid?.version ?? 0,
    };
  }

  private async require(id: string) {
    const event = await this.prisma.liveEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Live event not found');
    return event;
  }

  private view(e: {
    id: string;
    auctionId: string | null;
    title: string;
    status: string;
    playbackUrl: string | null;
    simulcastUrl: string | null;
    recordingUrl: string | null;
  }) {
    return {
      id: e.id,
      auctionId: e.auctionId,
      title: e.title,
      status: e.status,
      playbackUrl: e.playbackUrl,
      simulcastUrl: e.simulcastUrl,
      recordingUrl: e.recordingUrl,
    };
  }
}
