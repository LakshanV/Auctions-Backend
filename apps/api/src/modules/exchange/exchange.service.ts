import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DomainEventName,
  type MakeOfferInput,
  type RespondOfferInput,
  type SetBuyNowPriceInput,
  type SubmitTenderInput,
  newId,
} from '@singha/contracts';
import { OFFER_RESPONSES, assertOfferTransition } from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { UnitOfWork, type UowContext } from '../../shared/persistence/unit-of-work';
import { sellerOrgForListing } from '../../shared/persistence/seller-org';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { CreditExposureService } from '../member/credit-exposure.service';

type FeatureKey = 'buyNow' | 'makeOffer' | 'sealedTender';

/**
 * Exchange scaffolds (docs/07): Buy Now, Make Offer, Sealed Tender. Each is
 * gated by its feature flag. All are server-authoritative; a unique asset cannot
 * sell twice (a UNIQUE Sale per listing + a row lock guarantee it). Sealed tender
 * values are never returned before the controlled open.
 */
@Injectable()
export class ExchangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly config: AppConfigService,
    private readonly exposure: CreditExposureService,
  ) {}

  /** Reserve bid-capacity for a binding purchase, converting it to a sale
   *  obligation; throws the deterministic denial code on refusal (§11). */
  private async reservePurchase(
    ctx: UowContext,
    input: {
      customerId: string;
      saleId: string;
      listingId: string;
      channel: string;
      amountMinor: bigint;
      currency: string;
    },
  ) {
    const eventLot = await ctx.tx.auctionEventLot.findFirst({
      where: { listingId: input.listingId },
      select: { auctionEventId: true },
    });
    const reserve = await this.exposure.reserveBindingSale(ctx, {
      customerId: input.customerId,
      saleId: input.saleId,
      sourceType: input.channel,
      sourceId: input.saleId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      scope: { eventId: eventLot?.auctionEventId ?? null },
    });
    if (!reserve.ok) {
      throw new ForbiddenException({
        code: reserve.reason,
        message: 'Purchase rejected by bid-capacity policy',
      });
    }
  }

  private requireFeature(key: FeatureKey) {
    if (!this.config.get().features[key]) {
      throw new NotFoundException('This sale mode is not enabled');
    }
  }

  private customer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  private async requireListing(id: string, method: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.saleMethod !== method) {
      throw new ConflictException(`Listing is not a ${method} listing`);
    }
    return listing;
  }

  // --- Buy Now --------------------------------------------------------------

  async setBuyNowPrice(principal: Principal, listingId: string, input: SetBuyNowPriceInput) {
    this.requireFeature('buyNow');
    await this.requireListing(listingId, 'BUY_NOW');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.listing.update({
        where: { id: listingId },
        data: { buyNowPriceMinor: BigInt(input.amountMinor), currency: input.currency },
      });
      ctx.audit({
        action: 'BUY_NOW_PRICE_SET',
        targetType: 'Listing',
        targetId: listingId,
        after: { amountMinor: input.amountMinor },
      });
      return {
        listingId,
        buyNowPriceMinor: Number(updated.buyNowPriceMinor),
        currency: updated.currency,
      };
    });
  }

  /** Atomic purchase — a unique asset cannot sell twice (row lock + UNIQUE Sale). */
  async buyNow(principal: Principal, listingId: string) {
    this.requireFeature('buyNow');
    const buyerId = this.customer(principal);
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.$queryRawUnsafe('SELECT id FROM listing WHERE id = $1 FOR UPDATE', listingId);
      const listing = await ctx.tx.listing.findUnique({ where: { id: listingId } });
      if (!listing) throw new NotFoundException('Listing not found');
      if (listing.saleMethod !== 'BUY_NOW') throw new ConflictException('Not a Buy Now listing');
      if (listing.buyNowPriceMinor == null) throw new ConflictException('Buy Now price not set');
      const existing = await ctx.tx.sale.findUnique({ where: { listingId } });
      if (existing) throw new ConflictException('Listing already sold');

      const sale = await ctx.tx.sale.create({
        data: {
          id: newId(),
          listingId,
          buyerCustomerId: buyerId,
          channel: 'buy_now',
          amountMinor: listing.buyNowPriceMinor,
          currency: listing.currency,
          sellerOrganizationId: await sellerOrgForListing(ctx.tx, listingId),
        },
      });
      await ctx.tx.listing.update({ where: { id: listingId }, data: { status: 'sold' } });
      await this.reservePurchase(ctx, {
        customerId: buyerId,
        saleId: sale.id,
        listingId,
        channel: 'buy_now',
        amountMinor: sale.amountMinor,
        currency: sale.currency,
      });
      ctx.emit({
        name: DomainEventName.SaleConfirmed,
        aggregateType: 'Listing',
        aggregateId: listingId,
        payload: {
          listingId,
          saleId: sale.id,
          channel: 'buy_now',
          buyerCustomerId: buyerId,
          amountMinor: Number(sale.amountMinor),
        },
      });
      ctx.audit({ action: 'BUY_NOW_PURCHASED', targetType: 'Listing', targetId: listingId });
      return this.saleView(sale);
    });
  }

  // --- Make Offer -----------------------------------------------------------

  async makeOffer(principal: Principal, listingId: string, input: MakeOfferInput) {
    this.requireFeature('makeOffer');
    const buyerId = this.customer(principal);
    await this.requireListing(listingId, 'MAKE_OFFER');
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const offer = await ctx.tx.offer.create({
        data: {
          id,
          listingId,
          customerId: buyerId,
          status: 'open',
          amountMinor: BigInt(input.amountMinor),
          currency: input.currency,
        },
      });
      await ctx.tx.offerEvent.create({
        data: {
          id: newId(),
          offerId: id,
          type: 'offer',
          amountMinor: BigInt(input.amountMinor),
          note: input.note,
          actorType: actor.type,
          actorId: actor.id,
        },
      });
      ctx.emit({
        name: DomainEventName.OfferPlaced,
        aggregateType: 'Offer',
        aggregateId: id,
        payload: { offerId: id, listingId, customerId: buyerId },
      });
      ctx.audit({ action: 'OFFER_PLACED', targetType: 'Offer', targetId: id });
      return this.offerView(offer);
    });
  }

  async respondOffer(principal: Principal, offerId: string, input: RespondOfferInput) {
    this.requireFeature('makeOffer');
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    const map = OFFER_RESPONSES[input.response];
    assertOfferTransition(offer.status, map.status);

    const actor = toActor(principal);
    const accepted = map.status === 'accepted';
    return this.uow.execute(actor, async (ctx) => {
      const amount = input.amountMinor == null ? offer.amountMinor : BigInt(input.amountMinor);
      const updated = await ctx.tx.offer.update({
        where: { id: offerId },
        data: { status: map.status, amountMinor: amount },
      });
      await ctx.tx.offerEvent.create({
        data: {
          id: newId(),
          offerId,
          type: map.type,
          amountMinor: input.response === 'counter' ? amount : offer.amountMinor,
          note: input.note,
          actorType: actor.type,
          actorId: actor.id,
        },
      });
      if (accepted) {
        // Lock the listing row so two concurrent accepts (or an accept racing a Buy Now on the
        // same listing) serialize on it — otherwise both pass the sale-existence check and the
        // second hits a raw unique-violation 500 instead of a clean 409. Sale.listingId @unique
        // still guarantees no double-sale; this just makes the loser fail cleanly. Mirrors buyNow.
        await ctx.tx.$queryRawUnsafe(
          'SELECT id FROM listing WHERE id = $1 FOR UPDATE',
          offer.listingId,
        );
        const existing = await ctx.tx.sale.findUnique({ where: { listingId: offer.listingId } });
        if (existing) throw new ConflictException('Listing already sold');
        const sale = await ctx.tx.sale.create({
          data: {
            id: newId(),
            listingId: offer.listingId,
            buyerCustomerId: offer.customerId,
            channel: 'make_offer',
            amountMinor: offer.amountMinor,
            currency: offer.currency,
            sellerOrganizationId: await sellerOrgForListing(ctx.tx, offer.listingId),
          },
        });
        await ctx.tx.listing.update({ where: { id: offer.listingId }, data: { status: 'sold' } });
        await this.reservePurchase(ctx, {
          customerId: offer.customerId,
          saleId: sale.id,
          listingId: offer.listingId,
          channel: 'make_offer',
          amountMinor: sale.amountMinor,
          currency: sale.currency,
        });
        ctx.emit({
          name: DomainEventName.SaleConfirmed,
          aggregateType: 'Listing',
          aggregateId: offer.listingId,
          payload: {
            listingId: offer.listingId,
            saleId: sale.id,
            channel: 'make_offer',
            buyerCustomerId: offer.customerId,
            amountMinor: Number(offer.amountMinor),
          },
        });
      }
      ctx.emit({
        name: DomainEventName.OfferResponded,
        aggregateType: 'Offer',
        aggregateId: offerId,
        payload: { offerId, response: input.response, status: map.status },
      });
      ctx.audit({
        action: `OFFER_${input.response.toUpperCase()}`,
        targetType: 'Offer',
        targetId: offerId,
        after: { status: map.status },
      });
      return this.offerView(updated);
    });
  }

  async withdrawOffer(principal: Principal, offerId: string) {
    this.requireFeature('makeOffer');
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.customerId !== principal.customerId) {
      throw new ForbiddenException('You can only withdraw your own offer');
    }
    assertOfferTransition(offer.status, 'withdrawn');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.offer.update({
        where: { id: offerId },
        data: { status: 'withdrawn' },
      });
      await ctx.tx.offerEvent.create({
        data: {
          id: newId(),
          offerId,
          type: 'withdraw',
          actorType: actor.type,
          actorId: actor.id,
        },
      });
      ctx.audit({ action: 'OFFER_WITHDRAWN', targetType: 'Offer', targetId: offerId });
      return this.offerView(updated);
    });
  }

  async offersForListing(listingId: string) {
    const rows = await this.prisma.offer.findMany({
      where: { listingId },
      orderBy: [{ amountMinor: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((o) => this.offerView(o));
  }

  async myOffers(principal: Principal) {
    const rows = await this.prisma.offer.findMany({
      where: { customerId: this.customer(principal) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((o) => this.offerView(o));
  }

  // --- Sealed Tender --------------------------------------------------------

  async submitTender(principal: Principal, listingId: string, input: SubmitTenderInput) {
    this.requireFeature('sealedTender');
    const buyerId = this.customer(principal);
    await this.requireListing(listingId, 'SEALED_TENDER');
    const opened = await this.prisma.tenderBid.findFirst({
      where: { listingId, openedAt: { not: null } },
    });
    if (opened) throw new ConflictException('Tender is closed');
    const dupe = await this.prisma.tenderBid.findUnique({
      where: { listingId_customerId: { listingId, customerId: buyerId } },
    });
    if (dupe) throw new ConflictException('You have already submitted a tender bid');

    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.tenderBid.create({
        data: {
          id,
          listingId,
          customerId: buyerId,
          amountMinor: BigInt(input.amountMinor),
          currency: input.currency,
        },
      });
      ctx.emit({
        name: DomainEventName.TenderSubmitted,
        aggregateType: 'Listing',
        aggregateId: listingId,
        payload: { listingId, tenderBidId: id },
      });
      ctx.audit({ action: 'TENDER_SUBMITTED', targetType: 'TenderBid', targetId: id });
      // Sealed receipt — never echo the amount back or reveal competitors.
      return { id, listingId, sealed: true };
    });
  }

  /** Controlled open (docs/07): reveal + rank, award highest, mark sold. */
  async openTender(principal: Principal, listingId: string) {
    this.requireFeature('sealedTender');
    await this.requireListing(listingId, 'SEALED_TENDER');
    const already = await this.prisma.tenderBid.findFirst({
      where: { listingId, openedAt: { not: null } },
    });
    if (already) throw new ConflictException('Tender already opened');
    const bids = await this.prisma.tenderBid.findMany({ where: { listingId } });
    if (bids.length === 0) throw new BadRequestException('No tender bids to open');

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const now = new Date();
      // Lock the listing and RE-READ the tender bids inside the tx: a concurrent submitTender
      // could otherwise land a (possibly winning) bid between the pre-tx read above and this
      // update, so it would be marked opened yet excluded from ranking. Rank the fresh set.
      await ctx.tx.$queryRawUnsafe('SELECT id FROM listing WHERE id = $1 FOR UPDATE', listingId);
      const freshBids = await ctx.tx.tenderBid.findMany({ where: { listingId } });
      if (freshBids.length === 0) throw new BadRequestException('No tender bids to open');
      await ctx.tx.tenderBid.updateMany({ where: { listingId }, data: { openedAt: now } });
      const ranked = [...freshBids].sort((a, b) => Number(b.amountMinor - a.amountMinor));
      const winner = ranked[0];
      if (!winner) throw new BadRequestException('No tender bids to open');
      const sale = await ctx.tx.sale.create({
        data: {
          id: newId(),
          listingId,
          buyerCustomerId: winner.customerId,
          channel: 'sealed_tender',
          amountMinor: winner.amountMinor,
          currency: winner.currency,
          sellerOrganizationId: await sellerOrgForListing(ctx.tx, listingId),
        },
      });
      await ctx.tx.listing.update({ where: { id: listingId }, data: { status: 'sold' } });
      await this.reservePurchase(ctx, {
        customerId: winner.customerId,
        saleId: sale.id,
        listingId,
        channel: 'sealed_tender',
        amountMinor: sale.amountMinor,
        currency: sale.currency,
      });
      ctx.emit({
        name: DomainEventName.TenderOpened,
        aggregateType: 'Listing',
        aggregateId: listingId,
        payload: { listingId, bidCount: freshBids.length, winnerCustomerId: winner.customerId },
      });
      ctx.emit({
        name: DomainEventName.SaleConfirmed,
        aggregateType: 'Listing',
        aggregateId: listingId,
        payload: {
          listingId,
          saleId: sale.id,
          channel: 'sealed_tender',
          buyerCustomerId: winner.customerId,
          amountMinor: Number(winner.amountMinor),
        },
      });
      ctx.audit({ action: 'TENDER_OPENED', targetType: 'Listing', targetId: listingId });
      return {
        listingId,
        bidCount: bids.length,
        winnerCustomerId: winner.customerId,
        ranking: ranked.map((b, i) => ({
          rank: i + 1,
          customerId: b.customerId,
          amountMinor: Number(b.amountMinor),
        })),
      };
    });
  }

  /** Staff roster of tender bids — sealed (count only) until the open. */
  async tenderBids(listingId: string) {
    const bids = await this.prisma.tenderBid.findMany({
      where: { listingId },
      orderBy: { amountMinor: 'desc' },
    });
    const isOpen = bids.some((b) => b.openedAt != null);
    if (!isOpen) return { listingId, sealed: true, count: bids.length };
    return {
      listingId,
      sealed: false,
      bids: bids.map((b, i) => ({
        rank: i + 1,
        customerId: b.customerId,
        amountMinor: Number(b.amountMinor),
      })),
    };
  }

  private saleView(s: { id: string; listingId: string; amountMinor: bigint; currency: string }) {
    return {
      saleId: s.id,
      listingId: s.listingId,
      amountMinor: Number(s.amountMinor),
      currency: s.currency,
      sold: true,
    };
  }

  private offerView(o: {
    id: string;
    listingId: string;
    customerId: string;
    status: string;
    amountMinor: bigint;
    currency: string;
  }) {
    return {
      id: o.id,
      listingId: o.listingId,
      customerId: o.customerId,
      status: o.status,
      amountMinor: Number(o.amountMinor),
      currency: o.currency,
    };
  }
}
