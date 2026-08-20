import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AwardSealedOfferInput,
  type CounterOfferBody,
  DomainEventName,
  type MyOffersQuery,
  type OfferProposal,
  Permission,
  type SubmitOfferInput,
  newId,
} from '@singha/contracts';
import {
  type OfferStatus,
  type SealedOffer,
  type SealedViewerRole,
  assertOfferTransition,
  bindingTotalMinor,
  canRevealSealedOffers,
  comparableHeadlineMinor,
  defaultAwardPolicy,
  nextRevisionNumber,
  revealedRankedOffers,
  sealedParticipationView,
  selectSealedWinner,
} from '@singha/domain';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { UnitOfWork, type UowContext } from '../../shared/persistence/unit-of-work';
import { sellerOrgForListing } from '../../shared/persistence/seller-org';
import { toActor } from '../../shared/auth/actor';
import { type Actor } from '@singha/contracts';
import {
  customerScopeFilter,
  isActingForOrganization,
  resolveActorContext,
} from '../../shared/auth/actor-context';
import { type Principal } from '../../shared/auth/principal';
import { CreditExposureService } from '../member/credit-exposure.service';

type FeatureKey = 'commercialOffersV2' | 'sealedOffers';

/** The subset of an OfferRevision needed to derive a binding/comparable price. */
type PriceShape = {
  totalPriceMinor: bigint | null;
  unitPriceMinor: bigint | null;
  quantity: string | null;
};

/**
 * Commercial Offer Engine V2 (Evolution E4, pack doc 08). A negotiation surface where a
 * proposal is a full commercial bundle (price + quantity + trade/delivery/payment terms)
 * captured as an immutable {@link OfferRevision}; every counter APPENDS a revision (prior
 * terms are never overwritten). Two flag-gated modes:
 *  - open negotiation (`commercialOffersV2`): submit → counter → accept the terms on the table;
 *  - confidential sealed offers (`sealedOffers`): submit sealed → controlled reveal → explicit
 *    award.
 *
 * The non-negotiable this service guards is DECISIONS **D4**: a sealed offer's highest proposal
 * is NEVER auto-awarded. Selection defaults to MANUAL_SELECTION (an explicit chosen offer);
 * AUTO_HIGHEST is honoured only when the authorised seller/operator opts into it. Binding is
 * server-authoritative: a unique asset cannot sell twice (a row lock + the UNIQUE `Sale` per
 * listing guarantee it), competitor prices never leak before the reveal, and the bound amount is
 * an exact integer of minor units (never a float — D5).
 *
 * **Books of record.** An offer belongs to exactly one buyer book: the submitting member's personal
 * book, or an organization's. The book is chosen by the buyer's EXPLICIT acting context at
 * submission and stamped durably onto the row (`buyerOrganizationId`); it is never inferred from the
 * submitter's memberships. Buyer-owned reads and the buyer-owned withdraw then re-derive the book
 * from the record, so a personal offer is unreachable from an organization context and one
 * organization's offers are unreachable from another's. The SELLER/counterparty side is deliberately
 * untouched: counter/reject/accept/reveal/award/roster still authorize through
 * {@link resolveManageRole} on listing ownership, because a seller's right to answer an offer on
 * their own listing does not depend on which book the buyer filed it in.
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly config: AppConfigService,
    private readonly exposure: CreditExposureService,
  ) {}

  // --- guards / helpers -----------------------------------------------------

  private requireFeature(key: FeatureKey): void {
    if (!this.config.get().features[key]) {
      throw new NotFoundException('This offer surface is not enabled');
    }
  }

  private customer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  /**
   * RW5 — server-side authorization for managing a listing's offers (defence in depth on top of
   * the `exchange:operate-own` route guard). A platform operator (`exchange:operate`) may manage
   * ANY listing's offers. Otherwise the caller must be an owner/admin member of the listing's OWN
   * seller organization (ownership check — prevents IDOR across sellers) and is granted the
   * domain's `'seller'` viewer; anyone else is refused. Confidentiality is unchanged: sealed values
   * stay counts-only until the reveal regardless of who calls.
   */
  private async resolveManageRole(
    principal: Principal,
    listingId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<SealedViewerRole> {
    if (principal.permissions.has(Permission.ExchangeOperate)) return 'operator';
    const customerId = principal.customerId;
    if (customerId) {
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: { asset: { select: { ownerCustomerId: true, sellerOrganizationId: true } } },
      });
      const asset = listing?.asset;
      if (asset) {
        // (a) the individual owner/consignor of the asset, OR
        if (asset.ownerCustomerId && asset.ownerCustomerId === customerId) return 'seller';
        // (b) an owner/admin member of the asset's selling organization.
        if (asset.sellerOrganizationId) {
          const member = await tx.organizationMember.findFirst({
            where: {
              organizationId: asset.sellerOrganizationId,
              customerId,
              role: { in: ['owner', 'admin'] },
            },
          });
          if (member) return 'seller';
        }
      }
    }
    throw new ForbiddenException('Not permitted to manage offers for this listing');
  }

  private priceShape(rev: {
    totalPriceMinor: bigint | null;
    unitPriceMinor: bigint | null;
    quantity: { toString(): string } | null;
  }): PriceShape {
    return {
      totalPriceMinor: rev.totalPriceMinor,
      unitPriceMinor: rev.unitPriceMinor,
      quantity: rev.quantity != null ? rev.quantity.toString() : null,
    };
  }

  private proposalPriceShape(p: OfferProposal): PriceShape {
    return {
      totalPriceMinor: p.totalPriceMinor != null ? BigInt(p.totalPriceMinor) : null,
      unitPriceMinor: p.unitPriceMinor != null ? BigInt(p.unitPriceMinor) : null,
      quantity: p.quantity ?? null,
    };
  }

  /** Build the immutable OfferRevision row data from a validated proposal. */
  private revisionData(
    id: string,
    offerId: string,
    revisionNumber: number,
    authorType: string,
    authorId: string | null,
    p: OfferProposal,
  ) {
    return {
      id,
      offerId,
      revisionNumber,
      authorType,
      authorId: authorId ?? undefined,
      totalPriceMinor: p.totalPriceMinor != null ? BigInt(p.totalPriceMinor) : null,
      unitPriceMinor: p.unitPriceMinor != null ? BigInt(p.unitPriceMinor) : null,
      currency: p.currency,
      // Prisma accepts a decimal string for a Decimal column (never a JS float — D5).
      quantity: p.quantity ?? null,
      quantityUnitCode: p.quantityUnitCode ?? null,
      incoterm: p.incoterm ?? null,
      originLocationId: p.originLocationId ?? null,
      destinationLocationId: p.destinationLocationId ?? null,
      deliveryDate: p.deliveryDate ? new Date(p.deliveryDate) : null,
      deliveryWindowStart: p.deliveryWindowStart ? new Date(p.deliveryWindowStart) : null,
      deliveryWindowEnd: p.deliveryWindowEnd ? new Date(p.deliveryWindowEnd) : null,
      paymentTerms: p.paymentTerms ?? null,
      freightResponsibility: p.freightResponsibility ?? null,
      validUntil: p.validUntil ? new Date(p.validUntil) : null,
      notes: p.notes ?? null,
    };
  }

  /** Reserve bid-capacity for a binding purchase (§11), mirroring the exchange path. */
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
  ): Promise<void> {
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

  // --- open negotiation -----------------------------------------------------

  /** A buyer submits a new offer (revision 1) — full commercial terms on a listing. */
  async submitOffer(principal: Principal, input: SubmitOfferInput) {
    this.requireFeature('commercialOffersV2');
    const sealed = input.sealed ?? false;
    if (sealed) this.requireFeature('sealedOffers');
    const buyerId = this.customer(principal);
    // Authorized BEFORE anything is read or written: an organization context needs real membership
    // of that organization (or the `organization:manage` grant). The default personal context can
    // never produce an organization attribution.
    const context = await resolveActorContext(this.prisma, principal, input);

    const listing = await this.prisma.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new NotFoundException('Listing not found');

    const sold = await this.prisma.sale.findUnique({ where: { listingId: input.listingId } });
    if (sold) throw new ConflictException('Listing already sold');

    if (sealed) {
      const revealed = await this.prisma.offer.findFirst({
        where: { listingId: input.listingId, sealed: true, revealedAt: { not: null } },
      });
      if (revealed)
        throw new ConflictException('Sealed offers for this listing are already revealed');
      const live = { notIn: ['withdrawn', 'rejected', 'expired'] as OfferStatus[] };
      // One sealed offer per natural person on a listing — UNCHANGED, and deliberately not scoped
      // to the book: the same human must not be able to bid twice on one sealed tender by wearing a
      // personal and an organization hat.
      const dupe = await this.prisma.offer.findFirst({
        where: { listingId: input.listingId, sealed: true, customerId: buyerId, status: live },
      });
      if (dupe) throw new ConflictException('You already have a sealed offer on this listing');
      // …and one sealed offer per ORGANIZATION, so two colleagues cannot both bid for the same
      // company. Additive: it can only ever refuse a submission the old rule allowed.
      if (context.organizationId) {
        const orgDupe = await this.prisma.offer.findFirst({
          where: {
            listingId: input.listingId,
            sealed: true,
            buyerOrganizationId: context.organizationId,
            status: live,
          },
        });
        if (orgDupe) {
          throw new ConflictException('This organization already has a sealed offer on this listing');
        }
      }
    }

    const proposal = input.proposal;
    const headline = comparableHeadlineMinor(this.proposalPriceShape(proposal)) ?? 0n;

    const actor = toActor(principal);
    const offerId = newId();
    const revisionId = newId();
    return this.uow.execute(actor, async (ctx) => {
      const offer = await ctx.tx.offer.create({
        data: {
          id: offerId,
          listingId: input.listingId,
          customerId: buyerId,
          buyerOrganizationId: context.organizationId,
          status: 'open',
          amountMinor: headline,
          currency: proposal.currency,
          saleMethodCode: input.saleMethodCode,
          sealed,
          awardPolicy: defaultAwardPolicy(),
          currentRevisionId: revisionId,
        },
      });
      await ctx.tx.offerRevision.create({
        data: this.revisionData(revisionId, offerId, 1, 'buyer', buyerId, proposal),
      });
      await ctx.tx.offerEvent.create({
        data: {
          id: newId(),
          offerId,
          type: 'offer',
          amountMinor: proposal.totalPriceMinor != null ? BigInt(proposal.totalPriceMinor) : null,
          note: proposal.notes,
          actorType: actor.type,
          actorId: actor.id,
        },
      });
      ctx.emit({
        name: DomainEventName.OfferPlaced,
        aggregateType: 'Offer',
        aggregateId: offerId,
        payload: { offerId, listingId: input.listingId, customerId: buyerId, sealed },
      });
      ctx.audit({
        action: 'OFFER_V2_SUBMITTED',
        targetType: 'Offer',
        targetId: offerId,
        after: { context: context.kind, buyerOrganizationId: context.organizationId },
      });
      // Sealed submissions return a receipt only — never echo the amount (pack doc 20).
      return sealed
        ? {
            id: offer.id,
            listingId: offer.listingId,
            sealed: true,
            status: offer.status,
            context: context.kind,
            buyerOrganizationId: offer.buyerOrganizationId,
          }
        : { ...this.offerView(offer), context: context.kind };
    });
  }

  /** Seller/operator counters an offer — appends a new revision; prior terms are untouched. */
  async counterOffer(principal: Principal, offerId: string, body: CounterOfferBody) {
    this.requireFeature('commercialOffersV2');
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { revisions: { select: { revisionNumber: true } } },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    // RW5 — operator OR owning seller only (a seller can only counter their own listing's offers).
    await this.resolveManageRole(principal, offer.listingId);
    if (offer.sealed) {
      throw new ConflictException('Sealed offers cannot be countered — reveal and award instead');
    }
    assertOfferTransition(offer.status as OfferStatus, 'countered');

    const actor = toActor(principal);
    const revisionId = newId();
    const revisionNumber = nextRevisionNumber(offer.revisions);
    const proposal = body.proposal;
    const headline =
      comparableHeadlineMinor(this.proposalPriceShape(proposal)) ?? offer.amountMinor;
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.offerRevision.create({
        data: this.revisionData(revisionId, offerId, revisionNumber, 'seller', actor.id, proposal),
      });
      const updated = await ctx.tx.offer.update({
        where: { id: offerId },
        data: {
          status: 'countered',
          currentRevisionId: revisionId,
          amountMinor: headline,
          currency: proposal.currency,
        },
      });
      await ctx.tx.offerEvent.create({
        data: {
          id: newId(),
          offerId,
          type: 'counter',
          amountMinor: proposal.totalPriceMinor != null ? BigInt(proposal.totalPriceMinor) : null,
          note: proposal.notes,
          actorType: actor.type,
          actorId: actor.id,
        },
      });
      ctx.emit({
        name: DomainEventName.OfferResponded,
        aggregateType: 'Offer',
        aggregateId: offerId,
        payload: { offerId, response: 'counter', status: 'countered', revisionNumber },
      });
      ctx.audit({
        action: 'OFFER_V2_COUNTERED',
        targetType: 'Offer',
        targetId: offerId,
        after: { revisionNumber },
      });
      return this.offerView(updated);
    });
  }

  /** Seller/operator rejects an offer. */
  async rejectOffer(principal: Principal, offerId: string) {
    this.requireFeature('commercialOffersV2');
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    // RW5 — operator OR owning seller only (a seller can only reject their own listing's offers).
    await this.resolveManageRole(principal, offer.listingId);
    assertOfferTransition(offer.status as OfferStatus, 'rejected');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.offer.update({
        where: { id: offerId },
        data: { status: 'rejected' },
      });
      await ctx.tx.offerEvent.create({
        data: { id: newId(), offerId, type: 'reject', actorType: actor.type, actorId: actor.id },
      });
      ctx.emit({
        name: DomainEventName.OfferResponded,
        aggregateType: 'Offer',
        aggregateId: offerId,
        payload: { offerId, response: 'reject', status: 'rejected' },
      });
      ctx.audit({ action: 'OFFER_V2_REJECTED', targetType: 'Offer', targetId: offerId });
      return this.offerView(updated);
    });
  }

  /**
   * A buyer withdraws their own offer, authorized against the book the RECORD belongs to.
   *
   * - An organization-attributed offer may be withdrawn by any member of THAT organization (or
   *   `organization:manage` staff), so the company can retract its own bid even after the colleague
   *   who filed it leaves. Membership of a different organization is never enough.
   * - A personal offer may be withdrawn only by the individual who made it, so no organization
   *   membership can reach into someone's private negotiation.
   */
  async withdrawOffer(principal: Principal, offerId: string) {
    this.requireFeature('commercialOffersV2');
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    await this.requireBuyerSide(principal, offer);
    assertOfferTransition(offer.status as OfferStatus, 'withdrawn');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.offer.update({
        where: { id: offerId },
        data: { status: 'withdrawn' },
      });
      await ctx.tx.offerEvent.create({
        data: { id: newId(), offerId, type: 'withdraw', actorType: actor.type, actorId: actor.id },
      });
      ctx.audit({ action: 'OFFER_V2_WITHDRAWN', targetType: 'Offer', targetId: offerId });
      return this.offerView(updated);
    });
  }

  /**
   * Accept the terms currently on the table for an OPEN (non-sealed) offer — the binding path.
   * Runs entirely under a listing row lock so two concurrent accepts serialise; the UNIQUE Sale
   * per listing is the ultimate guarantee a unique asset cannot sell twice.
   */
  async acceptOffer(principal: Principal, offerId: string) {
    this.requireFeature('commercialOffersV2');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const pre = await ctx.tx.offer.findUnique({ where: { id: offerId } });
      if (!pre) throw new NotFoundException('Offer not found');
      // RW5 — operator OR owning seller only (a seller can only accept their own listing's offers).
      await this.resolveManageRole(principal, pre.listingId, ctx.tx);
      if (pre.sealed) {
        throw new ConflictException(
          'Sealed offers are awarded via reveal + award, not direct accept',
        );
      }
      // Serialise on the listing row (a unique asset sells once).
      await ctx.tx.$queryRawUnsafe(
        'SELECT id FROM listing WHERE id = $1 FOR UPDATE',
        pre.listingId,
      );
      const offer = await ctx.tx.offer.findUnique({ where: { id: offerId } });
      if (!offer) throw new NotFoundException('Offer not found');
      assertOfferTransition(offer.status as OfferStatus, 'accepted');
      if (!offer.currentRevisionId) {
        throw new ConflictException('Offer has no current revision to bind');
      }
      const revision = await ctx.tx.offerRevision.findUnique({
        where: { id: offer.currentRevisionId },
      });
      if (!revision) throw new ConflictException('Offer revision missing');
      return this.bindOfferToSale(ctx, {
        offer,
        revision,
        channel: 'make_offer',
        policyApplied: null,
        actor,
      });
    });
  }

  // --- sealed offers --------------------------------------------------------

  /** Counts-only participation view — the ONLY thing visible before a reveal (pack doc 20). */
  async sealedParticipation(_principal: Principal, listingId: string) {
    this.requireFeature('commercialOffersV2');
    this.requireFeature('sealedOffers');
    const offers = await this.loadSealedWithHeadline(listingId);
    const view = sealedParticipationView(offers.map((o) => o.sealed));
    return { listingId, participants: view.participants, offersReceived: view.offersReceived };
  }

  /** Controlled reveal — authorised seller/operator only; sets `revealedAt` and returns the rank. */
  async revealSealed(principal: Principal, listingId: string) {
    this.requireFeature('commercialOffersV2');
    this.requireFeature('sealedOffers');
    // RW5 — operator OR owning seller only (ownership enforced server-side; throws otherwise).
    const role = await this.resolveManageRole(principal, listingId);
    if (!canRevealSealedOffers(role)) {
      throw new ForbiddenException('Not authorised to reveal sealed offers');
    }
    const existing = await this.prisma.offer.findMany({ where: { listingId, sealed: true } });
    if (existing.length === 0) throw new BadRequestException('No sealed offers to reveal');
    const already = existing.some((o) => o.revealedAt != null);

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      if (!already) {
        await ctx.tx.offer.updateMany({
          where: { listingId, sealed: true, revealedAt: null },
          data: { revealedAt: new Date() },
        });
        ctx.audit({
          action: 'SEALED_OFFERS_REVEALED',
          targetType: 'Listing',
          targetId: listingId,
          after: { offerCount: existing.length },
        });
      }
      const loaded = await this.loadSealedWithHeadline(listingId, ctx.tx);
      return this.rankedSealedView(listingId, loaded);
    });
  }

  /**
   * Award a sealed offer AFTER its reveal — the heart of DECISIONS D4. Selection runs through the
   * pure {@link selectSealedWinner}: MANUAL_SELECTION (default) binds ONLY the explicitly chosen
   * offer (the highest is never auto-picked); AUTO_HIGHEST binds the highest only when the
   * authorised operator opted into it. Row-locked + UNIQUE Sale — awarded exactly once.
   */
  async awardSealed(principal: Principal, listingId: string, input: AwardSealedOfferInput) {
    this.requireFeature('commercialOffersV2');
    this.requireFeature('sealedOffers');
    // RW5 — operator OR owning seller only (ownership enforced server-side; throws otherwise).
    const role = await this.resolveManageRole(principal, listingId);
    if (!canRevealSealedOffers(role)) {
      throw new ForbiddenException('Not authorised to award sealed offers');
    }
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.$queryRawUnsafe('SELECT id FROM listing WHERE id = $1 FOR UPDATE', listingId);
      const sold = await ctx.tx.sale.findUnique({ where: { listingId } });
      if (sold) throw new ConflictException('Listing already sold');

      const loaded = await this.loadSealedWithHeadline(listingId, ctx.tx);
      if (loaded.length === 0) throw new BadRequestException('No sealed offers on this listing');
      const revealed = loaded.some((o) => o.offer.revealedAt != null);

      // Domain enforces D4: throws before reveal, and MANUAL_SELECTION without an explicit
      // selection throws (never auto-awards the highest).
      const winner = selectSealedWinner(
        loaded.map((o) => o.sealed),
        { policy: input.policy, revealed, explicitSelectionId: input.selectedOfferId },
      );
      const chosen = loaded.find((o) => o.offer.id === winner.id);
      if (!chosen || !chosen.revision) {
        throw new ConflictException('Winning offer has no revision to bind');
      }
      assertOfferTransition(chosen.offer.status as OfferStatus, 'accepted');
      return this.bindOfferToSale(ctx, {
        offer: chosen.offer,
        revision: chosen.revision,
        channel: 'sealed_tender',
        policyApplied: input.policy,
        actor,
      });
    });
  }

  // --- reads ----------------------------------------------------------------

  /**
   * The caller's own offers (buyer dashboard). Additive PUBLIC listing context is attached
   * (title/reference/sale method/location/cover image) so the UI never has to show a raw
   * listing CUID (CX pack doc 05) — never reserve, seller floor, proxy max, competitor or KYC
   * data, which stay entirely absent from this read model.
   */
  async myOffers(principal: Principal, query: MyOffersQuery = { context: 'personal' }) {
    const context = await resolveActorContext(this.prisma, principal, query);
    const rows = await this.prisma.offer.findMany({
      where: customerScopeFilter(context),
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            title: true,
            publicRef: true,
            saleMethod: true,
            locationCity: true,
            locationRegion: true,
            asset: {
              select: {
                media: {
                  where: { visibility: 'public', status: 'ready', kind: 'image' },
                  select: { storageKey: true, isCover: true, sortOrder: true },
                },
              },
            },
          },
        },
      },
    });
    return {
      context: {
        kind: context.kind,
        organizationId: context.organizationId,
        role: context.role,
        viaStaffPermission: context.viaStaffPermission,
      },
      offers: rows.map((o) => ({
        ...this.offerView(o),
        buyerOrganizationId: o.buyerOrganizationId,
        listing: this.offerListingContext(o.listing),
      })),
    };
  }

  /**
   * Buyer-side authorization for an EXISTING offer, derived from the record's book rather than from
   * a context the caller supplies — so nobody can pick a favourable context to widen their access.
   * Shared by every buyer-owned action on an offer.
   */
  private async requireBuyerSide(
    principal: Principal,
    offer: { customerId: string; buyerOrganizationId: string | null },
  ): Promise<void> {
    if (offer.buyerOrganizationId) {
      const permitted = await isActingForOrganization(
        this.prisma,
        principal,
        offer.buyerOrganizationId,
      );
      if (!permitted) {
        throw new ForbiddenException('Only the buying organization can act on this offer');
      }
      return;
    }
    if (!principal.customerId || offer.customerId !== principal.customerId) {
      throw new ForbiddenException('You can only withdraw your own offer');
    }
  }

  /**
   * Operator roster for a listing. Open offers list fully; sealed offers are counts-only until
   * the reveal, then ranked — competitor prices never appear before the window closes.
   */
  async offersForListing(principal: Principal, listingId: string) {
    this.requireFeature('commercialOffersV2');
    // RW5 — operator OR owning seller only; a competitor/buyer cannot read this roster.
    await this.resolveManageRole(principal, listingId);
    const sealed = await this.loadSealedWithHeadline(listingId);
    if (sealed.length > 0) {
      const revealed = sealed.some((o) => o.offer.revealedAt != null);
      if (!revealed) {
        const view = sealedParticipationView(sealed.map((o) => o.sealed));
        return { listingId, sealed: true, revealed: false, ...view };
      }
      return { sealed: true, ...this.rankedSealedView(listingId, sealed) };
    }
    const rows = await this.prisma.offer.findMany({
      where: { listingId, sealed: false },
      orderBy: [{ amountMinor: 'desc' }, { createdAt: 'asc' }],
    });
    return { listingId, sealed: false, offers: rows.map((o) => this.offerView(o)) };
  }

  // --- internals ------------------------------------------------------------

  /**
   * The ONE money-critical bind: snapshot the selected revision, create exactly one Sale, mark
   * the listing sold, close the losing offers, and reserve credit — all inside the caller's
   * transaction. The bound amount comes from {@link bindingTotalMinor} (exact integer minor
   * units; a non-derivable total throws rather than inventing rounding).
   */
  private async bindOfferToSale(
    ctx: UowContext,
    args: {
      offer: {
        id: string;
        listingId: string;
        customerId: string;
        awardPolicy: string | null;
      };
      revision: {
        totalPriceMinor: bigint | null;
        unitPriceMinor: bigint | null;
        quantity: { toString(): string } | null;
        currency: string;
      };
      channel: 'make_offer' | 'sealed_tender';
      policyApplied: string | null;
      actor: Actor;
    },
  ) {
    const { offer, revision, channel, policyApplied, actor } = args;

    const existing = await ctx.tx.sale.findUnique({ where: { listingId: offer.listingId } });
    if (existing) throw new ConflictException('Listing already sold');

    const amountMinor = bindingTotalMinor(this.priceShape(revision));

    const sale = await ctx.tx.sale.create({
      data: {
        id: newId(),
        listingId: offer.listingId,
        buyerCustomerId: offer.customerId,
        channel,
        amountMinor,
        currency: revision.currency,
        sellerOrganizationId: await sellerOrgForListing(ctx.tx, offer.listingId),
      },
    });
    await ctx.tx.offer.update({
      where: { id: offer.id },
      data: { status: 'accepted', awardPolicy: policyApplied ?? offer.awardPolicy },
    });
    await ctx.tx.listing.update({ where: { id: offer.listingId }, data: { status: 'sold' } });
    // Close the losing offers on this listing (open/countered → rejected). Sealed losers too.
    await ctx.tx.offer.updateMany({
      where: {
        listingId: offer.listingId,
        id: { not: offer.id },
        status: { in: ['open', 'countered'] },
      },
      data: { status: 'rejected' },
    });
    await ctx.tx.offerEvent.create({
      data: {
        id: newId(),
        offerId: offer.id,
        type: 'accept',
        amountMinor,
        actorType: actor.type,
        actorId: actor.id,
      },
    });
    await this.reservePurchase(ctx, {
      customerId: offer.customerId,
      saleId: sale.id,
      listingId: offer.listingId,
      channel,
      amountMinor,
      currency: revision.currency,
    });
    ctx.emit({
      name: DomainEventName.SaleConfirmed,
      aggregateType: 'Listing',
      aggregateId: offer.listingId,
      payload: {
        listingId: offer.listingId,
        saleId: sale.id,
        channel,
        buyerCustomerId: offer.customerId,
        amountMinor: Number(amountMinor),
      },
    });
    ctx.emit({
      name: DomainEventName.OfferResponded,
      aggregateType: 'Offer',
      aggregateId: offer.id,
      payload: { offerId: offer.id, response: 'accept', status: 'accepted' },
    });
    ctx.audit({
      action: 'OFFER_V2_ACCEPTED',
      targetType: 'Offer',
      targetId: offer.id,
      after: { saleId: sale.id, channel, amountMinor: Number(amountMinor) },
    });
    return this.saleView(sale);
  }

  /** Load a listing's sealed offers with their current revision + a comparable headline. */
  private async loadSealedWithHeadline(listingId: string, tx?: UowContext['tx']) {
    const client = tx ?? this.prisma;
    const offers = await client.offer.findMany({
      where: { listingId, sealed: true },
      include: { revisions: true },
    });
    return offers.map((offer) => {
      const revision = offer.revisions.find((r) => r.id === offer.currentRevisionId) ?? null;
      const headline = revision ? comparableHeadlineMinor(this.priceShape(revision)) : null;
      const sealed: SealedOffer = {
        id: offer.id,
        totalPriceMinor: headline,
        status: offer.status,
      };
      return { offer, revision, headline, sealed };
    });
  }

  private rankedSealedView(
    listingId: string,
    loaded: Awaited<ReturnType<OffersService['loadSealedWithHeadline']>>,
  ) {
    const ranked = revealedRankedOffers(
      loaded.map((o) => o.sealed),
      { revealed: true, viewer: 'operator' },
    );
    const byId = new Map(loaded.map((o) => [o.offer.id, o]));
    return {
      listingId,
      revealed: true,
      offers: ranked.map((s, i) => {
        const entry = byId.get(s.id);
        return {
          rank: i + 1,
          offerId: s.id,
          customerId: entry?.offer.customerId ?? null,
          amountMinor: s.totalPriceMinor != null ? Number(s.totalPriceMinor) : null,
          currency: entry?.revision?.currency ?? null,
          revisionNumber: entry?.revision?.revisionNumber ?? null,
        };
      }),
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
    sealed?: boolean;
    currentRevisionId?: string | null;
    saleMethodCode?: string | null;
  }) {
    return {
      id: o.id,
      listingId: o.listingId,
      customerId: o.customerId,
      status: o.status,
      amountMinor: Number(o.amountMinor),
      currency: o.currency,
      sealed: o.sealed ?? false,
      currentRevisionId: o.currentRevisionId ?? null,
      saleMethodCode: o.saleMethodCode ?? null,
    };
  }

  /**
   * PUBLIC listing context attached to `myOffers` (CX pack doc 05) — enough for the buyer offer
   * console to show a real title/reference/location/cover instead of a raw listing CUID. Every
   * field here is public catalogue data (mirrors `CatalogueV2Service`'s public projection); this
   * must never grow reserve, seller floor, proxy max, competitor or KYC fields.
   */
  private offerListingContext(l: {
    title: string | null;
    publicRef: string;
    saleMethod: string;
    locationCity: string | null;
    locationRegion: string | null;
    asset: { media: { storageKey: string; isCover: boolean; sortOrder: number }[] };
  }) {
    const media = l.asset.media;
    const cover =
      media.find((m) => m.isCover) ?? [...media].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    return {
      title: l.title,
      publicRef: l.publicRef,
      saleMethod: l.saleMethod,
      location:
        l.locationCity || l.locationRegion
          ? { city: l.locationCity, region: l.locationRegion }
          : null,
      coverStorageKey: cover ? cover.storageKey : null,
    };
  }
}
