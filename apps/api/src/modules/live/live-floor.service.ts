import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DomainEventName } from '@singha/contracts';
import type { AuctionEvent, AuctionEventLot, LiveLotState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork, type UowContext } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { AuctionService } from '../auction/auction.service';

/** Transient (non-terminal) presentation states an auctioneer is actively driving. */
const ACTIVE: LiveLotState[] = ['on_block', 'going_once', 'going_twice'];
const TERMINAL: LiveLotState[] = ['sold', 'passed', 'withdrawn'];

/**
 * §21/§22 (RW6) — the auctioneer's live floor state machine over an AuctionEvent's ordered lots.
 *
 * This drives PRESENTATION state only — which lot is on the block, going once/twice, sold or
 * passed — and a current-lot pointer. The authoritative price/bid stays in the Auction/Bid ledger
 * (rule 12): a clerk's floor bid still goes through the row-locked engine (LiveService.floorBid),
 * and the live-room reads the engine's state, never a number this machine invents. Every
 * transition is validated, audited and emits a LiveLotStateChanged event for realtime consumers.
 */
@Injectable()
export class LiveFloorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly auctions: AuctionService,
  ) {}

  private async event(eventId: string): Promise<AuctionEvent> {
    const event = await this.prisma.auctionEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Auction event not found');
    return event;
  }

  private async lotOfEvent(eventId: string, lotId: string): Promise<AuctionEventLot> {
    const lot = await this.prisma.auctionEventLot.findUnique({ where: { id: lotId } });
    if (!lot || lot.auctionEventId !== eventId) {
      throw new BadRequestException('Lot does not belong to this event');
    }
    return lot;
  }

  /** Put a specific lot on the block. Valid from `pending` or a re-opened `passed` lot; any other
   *  lot left mid-call is reset to `pending` (the auctioneer moved on without a hammer). */
  async openLot(principal: Principal, eventId: string, lotId: string) {
    await this.event(eventId);
    const lot = await this.lotOfEvent(eventId, lotId);
    if (lot.liveState !== 'pending' && lot.liveState !== 'passed') {
      throw new BadRequestException(`Cannot open a lot in state '${lot.liveState}'`);
    }
    return this.uow.execute(toActor(principal), async (ctx) => {
      // Reset any other actively-called lot back to pending (never a terminal one).
      await ctx.tx.auctionEventLot.updateMany({
        where: { auctionEventId: eventId, id: { not: lotId }, liveState: { in: ACTIVE } },
        data: { liveState: 'pending' },
      });
      await ctx.tx.auctionEventLot.update({
        where: { id: lotId },
        data: { liveState: 'on_block' },
      });
      await ctx.tx.auctionEvent.update({ where: { id: eventId }, data: { currentLotId: lotId } });
      this.emitChange(ctx, eventId, lotId, 'on_block');
      return this.readFloor(eventId, ctx.tx);
    });
  }

  /** Advance the current lot's call stage: on_block → going_once → going_twice. */
  async call(principal: Principal, eventId: string, stage: 'going_once' | 'going_twice') {
    const event = await this.event(eventId);
    const lot = await this.currentLot(event);
    const ok =
      (stage === 'going_once' && lot.liveState === 'on_block') ||
      (stage === 'going_twice' && lot.liveState === 'going_once');
    if (!ok) {
      throw new BadRequestException(`Cannot call '${stage}' from '${lot.liveState}'`);
    }
    return this.transitionCurrent(principal, eventId, lot.id, stage);
  }

  /** Hammer down: the current lot is sold. Valid from any active call stage. */
  async sell(principal: Principal, eventId: string) {
    const event = await this.event(eventId);
    const lot = await this.currentLot(event);
    if (!ACTIVE.includes(lot.liveState)) {
      throw new BadRequestException(`Cannot sell a lot in state '${lot.liveState}'`);
    }
    return this.transitionCurrent(principal, eventId, lot.id, 'sold', true);
  }

  /** No sale: the current lot is passed (may be re-opened later). */
  async pass(principal: Principal, eventId: string) {
    const event = await this.event(eventId);
    const lot = await this.currentLot(event);
    if (!ACTIVE.includes(lot.liveState)) {
      throw new BadRequestException(`Cannot pass a lot in state '${lot.liveState}'`);
    }
    return this.transitionCurrent(principal, eventId, lot.id, 'passed');
  }

  /** Withdraw a lot from the sale entirely (only before it has sold). */
  async withdraw(principal: Principal, eventId: string, lotId: string) {
    const event = await this.event(eventId);
    const lot = await this.lotOfEvent(eventId, lotId);
    if (TERMINAL.includes(lot.liveState)) {
      throw new BadRequestException(`Cannot withdraw a lot in state '${lot.liveState}'`);
    }
    return this.uow.execute(toActor(principal), async (ctx) => {
      await ctx.tx.auctionEventLot.update({
        where: { id: lotId },
        data: { liveState: 'withdrawn' },
      });
      if (event.currentLotId === lotId) {
        await ctx.tx.auctionEvent.update({ where: { id: eventId }, data: { currentLotId: null } });
      }
      this.emitChange(ctx, eventId, lotId, 'withdrawn');
      return this.readFloor(eventId, ctx.tx);
    });
  }

  /** Advance to the next lot in sequence that is still awaiting sale, and put it on the block. */
  async next(principal: Principal, eventId: string) {
    await this.event(eventId);
    const nextLot = await this.prisma.auctionEventLot.findFirst({
      where: { auctionEventId: eventId, liveState: 'pending' },
      orderBy: { sequence: 'asc' },
    });
    if (!nextLot) throw new BadRequestException('No further lots awaiting sale');
    return this.openLot(principal, eventId, nextLot.id);
  }

  /** Public floor projection (customer live-room + auctioneer console read the same shape). */
  async floorState(eventId: string) {
    await this.event(eventId);
    return this.readFloor(eventId, this.prisma);
  }

  // --- internals ------------------------------------------------------------

  private async currentLot(event: AuctionEvent): Promise<AuctionEventLot> {
    if (!event.currentLotId) throw new BadRequestException('No lot is currently on the block');
    const lot = await this.prisma.auctionEventLot.findUnique({ where: { id: event.currentLotId } });
    if (!lot) throw new BadRequestException('No lot is currently on the block');
    return lot;
  }

  private async transitionCurrent(
    principal: Principal,
    eventId: string,
    lotId: string,
    to: LiveLotState,
    markSold = false,
  ) {
    return this.uow.execute(toActor(principal), async (ctx) => {
      await ctx.tx.auctionEventLot.update({
        where: { id: lotId },
        data: { liveState: to, ...(markSold ? { soldAt: new Date() } : {}) },
      });
      this.emitChange(ctx, eventId, lotId, to);
      return this.readFloor(eventId, ctx.tx);
    });
  }

  private emitChange(ctx: UowContext, eventId: string, lotId: string, state: LiveLotState) {
    ctx.emit({
      name: DomainEventName.LiveLotStateChanged,
      aggregateType: 'AuctionEvent',
      aggregateId: eventId,
      payload: { auctionEventId: eventId, lotId, state },
    });
    ctx.audit({
      action: 'LIVE_LOT_STATE_CHANGED',
      targetType: 'AuctionEventLot',
      targetId: lotId,
      after: { state },
    });
  }

  /**
   * Assemble the floor view: the event + its ordered lots (with live state + a customer-safe
   * title) + the AUTHORITATIVE bid state of the lot on the block, read from the auction engine.
   * `tx` lets this run inside the same transaction as a mutation so the returned view is fresh.
   */
  private async readFloor(
    eventId: string,
    tx: Pick<PrismaService, 'auctionEvent' | 'auctionEventLot'>,
  ) {
    const event = await tx.auctionEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Auction event not found');
    const lots = await tx.auctionEventLot.findMany({
      where: { auctionEventId: eventId },
      orderBy: { sequence: 'asc' },
      include: { listing: { include: { auction: true } } },
    });
    const currentLot = lots.find((l) => l.id === event.currentLotId) ?? null;
    const bid = currentLot?.listing.auction
      ? await this.auctions.getState(currentLot.listing.auction.id).catch(() => null)
      : null;
    return {
      eventId: event.id,
      title: event.title,
      status: event.status,
      currentLotId: event.currentLotId,
      current: currentLot
        ? {
            lotId: currentLot.id,
            sequence: currentLot.sequence,
            listingId: currentLot.listingId,
            title: currentLot.listing.title ?? currentLot.listing.publicRef,
            liveState: currentLot.liveState,
            bid,
            seq: bid?.version ?? 0,
          }
        : null,
      lots: lots.map((l) => ({
        lotId: l.id,
        sequence: l.sequence,
        listingId: l.listingId,
        title: l.listing.title ?? l.listing.publicRef,
        liveState: l.liveState,
      })),
    };
  }
}
