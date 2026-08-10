import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateAuctionInput,
  DomainEventName,
  type PlaceBidInput,
  newId,
} from '@singha/contracts';
import {
  type AuctionConfig,
  type BidderMaxEntry,
  applySoftClose,
  computeAuctionState,
  minimumAcceptableMax,
  reserveMet,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

/**
 * Timed auction engine orchestration (docs/07). Server-authoritative: every bid
 * runs in a transaction that ROW-LOCKS the auction (`SELECT … FOR UPDATE`), so
 * near-simultaneous bids serialize. Money is stored as BigInt (minor units) and
 * converted to JS number at this boundary (safe: amounts are well under 2^53).
 * Proxy maxima are private.
 */
@Injectable()
export class AuctionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {}

  async createAuction(principal: Principal, input: CreateAuctionInput) {
    const listing = await this.prisma.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    const existing = await this.prisma.auction.findUnique({
      where: { listingId: input.listingId },
    });
    if (existing) throw new ConflictException('An auction already exists for this listing');

    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const auction = await ctx.tx.auction.create({
        data: {
          id,
          listingId: input.listingId,
          status: 'scheduled',
          currency: input.currency,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          openingBidMinor: BigInt(input.openingBidMinor),
          reserveMinor: input.reserveMinor == null ? undefined : BigInt(input.reserveMinor),
          reserveVisible: input.reserveVisible,
          incrementMinor: BigInt(input.incrementMinor),
          softCloseTriggerSec: input.softCloseTriggerSec,
          softCloseExtendSec: input.softCloseExtendSec,
          buyerPremiumPct: input.buyerPremiumPct,
        },
      });
      ctx.audit({
        action: 'AUCTION_CONFIGURED',
        targetType: 'Auction',
        targetId: id,
        after: { listingId: input.listingId },
      });
      return this.publicAuction(auction);
    });
  }

  async open(principal: Principal, id: string) {
    const auction = await this.requireAuction(id);
    if (auction.status !== 'scheduled') throw new ConflictException('Auction is not scheduled');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.auction.update({ where: { id }, data: { status: 'open' } });
      ctx.emit({
        name: DomainEventName.AuctionOpened,
        aggregateType: 'Auction',
        aggregateId: id,
        payload: { auctionId: id },
      });
      ctx.audit({ action: 'AUCTION_OPENED', targetType: 'Auction', targetId: id });
      return this.publicAuction(updated);
    });
  }

  async placeBid(principal: Principal, auctionId: string, input: PlaceBidInput) {
    const bidderId = principal.customerId;
    if (!bidderId) throw new ForbiddenException('Bidder must be an authenticated customer');

    const actor = toActor(principal);
    return this.uow.execute(
      actor,
      async (ctx) => {
        await ctx.tx.$queryRawUnsafe('SELECT id FROM auction WHERE id = $1 FOR UPDATE', auctionId);

        const auction = await ctx.tx.auction.findUnique({ where: { id: auctionId } });
        if (!auction) throw new NotFoundException('Auction not found');

        const now = new Date();
        if (auction.status !== 'open') throw new ConflictException('Auction is not open');
        if (now >= auction.endsAt) throw new ConflictException('Auction has ended');

        if (input.idempotencyKey) {
          const dupe = await ctx.tx.bid.findFirst({
            where: { auctionId, idempotencyKey: input.idempotencyKey },
          });
          if (dupe) return this.bidderView(auction, bidderId, false);
        }

        const currentBid = auction.currentBidMinor == null ? null : Number(auction.currentBidMinor);
        const config: AuctionConfig = {
          openingBidMinor: Number(auction.openingBidMinor),
          incrementMinor: Number(auction.incrementMinor),
          reserveMinor: auction.reserveMinor == null ? null : Number(auction.reserveMinor),
          softCloseTriggerSec: auction.softCloseTriggerSec,
          softCloseExtendSec: auction.softCloseExtendSec,
          endsAt: auction.endsAt,
        };

        const minimum = minimumAcceptableMax(config, currentBid);
        if (input.maxAmountMinor < minimum) {
          throw new BadRequestException(`Maximum must be at least ${minimum} (minor units)`);
        }

        const existingMax = await ctx.tx.bidderMax.findUnique({
          where: { auctionId_bidderId: { auctionId, bidderId } },
        });
        const newMax = Math.max(Number(existingMax?.maxMinor ?? 0), input.maxAmountMinor);
        await ctx.tx.bidderMax.upsert({
          where: { auctionId_bidderId: { auctionId, bidderId } },
          update: { maxMinor: BigInt(newMax) },
          create: { id: newId(), auctionId, bidderId, maxMinor: BigInt(newMax) },
        });

        const maxRows = await ctx.tx.bidderMax.findMany({ where: { auctionId } });
        const maxes: BidderMaxEntry[] = maxRows.map((m) => ({
          bidderId: m.bidderId,
          maxMinor: Number(m.maxMinor),
          updatedAt: m.updatedAt,
        }));
        const state = computeAuctionState(config, maxes);

        const prevLeader = auction.highBidderId;
        const priceChanged = currentBid == null || state.currentBidMinor > currentBid;
        const leaderChanged = state.highBidderId !== prevLeader;

        let highBidId = auction.highBidId;
        if ((priceChanged || leaderChanged) && state.highBidderId) {
          const sequence = (await ctx.tx.bid.count({ where: { auctionId } })) + 1;
          const created = await ctx.tx.bid.create({
            data: {
              id: newId(),
              auctionId,
              sequence,
              bidderId: state.highBidderId,
              amountMinor: BigInt(state.currentBidMinor),
              source: state.highBidderId === bidderId ? input.source : 'proxy',
              status: 'accepted',
              idempotencyKey: input.idempotencyKey,
            },
          });
          highBidId = created.id;
        }

        const soft = applySoftClose(config, now);

        const updated = await ctx.tx.auction.update({
          where: { id: auctionId },
          data: {
            currentBidMinor: BigInt(state.currentBidMinor),
            highBidderId: state.highBidderId,
            highBidId,
            endsAt: soft.endsAt,
            extendedCount: auction.extendedCount + (soft.extended ? 1 : 0),
            version: { increment: 1 },
          },
        });

        ctx.emit({
          name: DomainEventName.BidAccepted,
          aggregateType: 'Auction',
          aggregateId: auctionId,
          payload: { auctionId, bidderId, currentBidMinor: state.currentBidMinor },
        });
        if (prevLeader && prevLeader !== state.highBidderId) {
          ctx.emit({
            name: DomainEventName.BidderOutbid,
            aggregateType: 'Auction',
            aggregateId: auctionId,
            payload: { auctionId, outbidCustomerId: prevLeader },
          });
        }
        if (soft.extended) {
          ctx.emit({
            name: DomainEventName.SoftCloseExtended,
            aggregateType: 'Auction',
            aggregateId: auctionId,
            payload: { auctionId, endsAt: soft.endsAt.toISOString() },
          });
        }
        ctx.audit({
          action: 'BID_PLACED',
          targetType: 'Auction',
          targetId: auctionId,
          after: { currentBidMinor: state.currentBidMinor },
        });

        return this.bidderView(updated, bidderId, soft.extended);
      },
      { timeout: 20000, maxWait: 20000 },
    );
  }

  async close(principal: Principal, id: string) {
    const auction = await this.requireAuction(id);
    if (auction.status === 'closed') return this.publicAuction(auction);
    if (auction.status !== 'open') throw new ConflictException('Auction is not open');

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const hammer = auction.currentBidMinor == null ? null : Number(auction.currentBidMinor);
      const sold =
        hammer != null &&
        auction.highBidderId != null &&
        reserveMet(auction.reserveMinor == null ? null : Number(auction.reserveMinor), hammer);
      const winner = sold ? auction.highBidderId : null;

      const updated = await ctx.tx.auction.update({
        where: { id },
        data: {
          status: 'closed',
          winnerCustomerId: winner ?? undefined,
          soldAt: sold ? new Date() : undefined,
        },
      });

      ctx.emit({
        name: DomainEventName.AuctionClosed,
        aggregateType: 'Auction',
        aggregateId: id,
        payload: {
          auctionId: id,
          sold,
          winnerCustomerId: winner,
          hammerMinor: sold ? hammer : null,
        },
      });
      if (sold) {
        ctx.emit({
          name: DomainEventName.SaleConfirmed,
          aggregateType: 'Auction',
          aggregateId: id,
          payload: {
            auctionId: id,
            listingId: auction.listingId,
            buyerCustomerId: winner,
            hammerMinor: hammer,
          },
        });
      }
      ctx.audit({
        action: sold ? 'AUCTION_SOLD' : 'AUCTION_PASSED_IN',
        targetType: 'Auction',
        targetId: id,
        after: { sold, winner },
      });
      return this.publicAuction(updated);
    });
  }

  /** Public, privacy-safe auction state (no reserve, leader identity, or maxima). */
  async getState(id: string) {
    const a = await this.prisma.auction.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Auction not found');
    const bidCount = await this.prisma.bid.count({ where: { auctionId: id } });
    return {
      id: a.id,
      listingId: a.listingId,
      status: a.status,
      currency: a.currency,
      openingBidMinor: Number(a.openingBidMinor),
      incrementMinor: Number(a.incrementMinor),
      currentBidMinor: a.currentBidMinor == null ? null : Number(a.currentBidMinor),
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      extendedCount: a.extendedCount,
      bidCount,
      reserveMet: a.reserveVisible
        ? reserveMet(
            a.reserveMinor == null ? null : Number(a.reserveMinor),
            Number(a.currentBidMinor ?? a.openingBidMinor),
          )
        : undefined,
    };
  }

  private bidderView(
    auction: {
      currentBidMinor: bigint | null;
      highBidderId: string | null;
      endsAt: Date;
      openingBidMinor: bigint;
    },
    bidderId: string,
    extended: boolean,
  ) {
    return {
      accepted: true,
      currentBidMinor: Number(auction.currentBidMinor ?? auction.openingBidMinor),
      youLead: auction.highBidderId === bidderId,
      endsAt: auction.endsAt.toISOString(),
      extended,
    };
  }

  /** Staff-facing auction view with money coerced to number (no BigInt in JSON). */
  private publicAuction(a: {
    id: string;
    listingId: string;
    status: string;
    currency: string;
    openingBidMinor: bigint;
    incrementMinor: bigint;
    currentBidMinor: bigint | null;
    startsAt: Date;
    endsAt: Date;
    winnerCustomerId: string | null;
    extendedCount: number;
  }) {
    return {
      id: a.id,
      listingId: a.listingId,
      status: a.status,
      currency: a.currency,
      openingBidMinor: Number(a.openingBidMinor),
      incrementMinor: Number(a.incrementMinor),
      currentBidMinor: a.currentBidMinor == null ? null : Number(a.currentBidMinor),
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      winnerCustomerId: a.winnerCustomerId,
      extendedCount: a.extendedCount,
    };
  }

  private async requireAuction(id: string) {
    const auction = await this.prisma.auction.findUnique({ where: { id } });
    if (!auction) throw new NotFoundException('Auction not found');
    return auction;
  }
}
