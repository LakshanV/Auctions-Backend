import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateListingInput,
  DomainEventName,
  Permission,
  type ReviewListingInput,
  type UpdateListingContentInput,
  newId,
} from '@singha/contracts';
import { assertListingTransition, saleMethodCodeForLegacyEnum } from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

/** Marketplace module (docs/06): a Listing is one sale attempt for an Asset. */
@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {}

  async createListing(principal: Principal, input: CreateListingInput) {
    const asset = await this.prisma.asset.findUnique({ where: { id: input.assetId } });
    if (!asset) throw new NotFoundException('Asset not found');

    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const listing = await ctx.tx.listing.create({
        data: {
          id,
          assetId: input.assetId,
          saleMethod: input.saleMethod,
          // Dual-write the configurable sale-method code alongside the enum (Evolution E3,
          // DECISIONS D3) so new rows match the migration backfill; the enum stays authoritative
          // until a later phase switches consumers over.
          saleMethodCode: saleMethodCodeForLegacyEnum(input.saleMethod),
          publicRef: input.publicRef,
          title: input.title,
          status: 'draft',
        },
      });
      ctx.audit({ action: 'LISTING_CREATED', targetType: 'Listing', targetId: id });
      return listing;
    });
  }

  /**
   * Edit a listing's public content + sale-mode display config (docs 06/07).
   * Owner (the asset's seller) or staff with listing:content. Never touches
   * commercial state (auction/bids) — pure presentation.
   */
  async updateContent(principal: Principal, id: string, input: UpdateListingContentInput) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { asset: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const isStaff = principal.permissions.has(Permission.ListingReview);
    const isOwner = listing.asset.ownerCustomerId === principal.customerId;
    if (!isStaff && !isOwner) {
      throw new ForbiddenException('Only the seller or staff can edit this listing');
    }
    // Only staff may set the editorial `featured` flag.
    const featured = isStaff ? input.featured : undefined;

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.listing.update({
        where: { id },
        data: {
          shortDescription: input.shortDescription,
          fullDescription: input.fullDescription,
          locationCity: input.locationCity,
          locationRegion: input.locationRegion,
          inspectionSummary: input.inspectionSummary,
          collectionSummary: input.collectionSummary,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          publicTermsRef: input.publicTermsRef,
          featured,
          guidePriceMinor:
            input.guidePriceMinor === undefined
              ? undefined
              : input.guidePriceMinor === null
                ? null
                : BigInt(input.guidePriceMinor),
          showGuidePrice: input.showGuidePrice,
          opensAt:
            input.opensAt === undefined
              ? undefined
              : input.opensAt
                ? new Date(input.opensAt)
                : null,
          closesAt:
            input.closesAt === undefined
              ? undefined
              : input.closesAt
                ? new Date(input.closesAt)
                : null,
        },
      });
      ctx.audit({ action: 'LISTING_CONTENT_UPDATED', targetType: 'Listing', targetId: id });
      return { id: updated.id, featured: updated.featured, showGuidePrice: updated.showGuidePrice };
    });
  }

  /** The caller's own listings (assets they own) — seller dashboard. */
  async mine(principal: Principal) {
    if (!principal.customerId) return [];
    const rows = await this.prisma.listing.findMany({
      where: { asset: { ownerCustomerId: principal.customerId } },
      orderBy: { createdAt: 'desc' },
      include: { asset: true },
    });
    return rows.map((l) => this.view(l));
  }

  /** Listings awaiting staff review/publish — admin approvals queue. */
  async reviewQueue() {
    const rows = await this.prisma.listing.findMany({
      where: { status: { in: ['submitted', 'review', 'approved'] } },
      orderBy: { createdAt: 'asc' },
      include: { asset: true },
    });
    return rows.map((l) => this.view(l));
  }

  private view(l: {
    id: string;
    publicRef: string;
    title: string | null;
    saleMethod: string;
    status: string;
    createdAt: Date;
    asset: { category: string };
  }) {
    return {
      id: l.id,
      publicRef: l.publicRef,
      title: l.title,
      saleMethod: l.saleMethod,
      status: l.status,
      category: l.asset.category,
      createdAt: l.createdAt,
    };
  }

  async submit(principal: Principal, id: string) {
    const listing = await this.requireListing(id);
    assertListingTransition(listing.status, 'submitted');

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.listing.update({ where: { id }, data: { status: 'submitted' } });
      ctx.audit({
        action: 'LISTING_SUBMITTED',
        targetType: 'Listing',
        targetId: id,
        before: { status: listing.status },
        after: { status: 'submitted' },
      });
      return updated;
    });
  }

  async review(principal: Principal, id: string, input: ReviewListingInput) {
    const listing = await this.requireListing(id);
    const target = input.decision === 'approve' ? 'approved' : 'changes_required';
    assertListingTransition(listing.status, target);

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.listing.update({ where: { id }, data: { status: target } });
      ctx.audit({
        action: input.decision === 'approve' ? 'LISTING_APPROVED' : 'LISTING_CHANGES_REQUESTED',
        targetType: 'Listing',
        targetId: id,
        reason: input.note,
        before: { status: listing.status },
        after: { status: target },
      });
      if (input.decision === 'approve') {
        ctx.emit({
          name: DomainEventName.ListingApproved,
          aggregateType: 'Listing',
          aggregateId: id,
          payload: { listingId: id, assetId: listing.assetId },
        });
      }
      return updated;
    });
  }

  async publish(principal: Principal, id: string) {
    const listing = await this.requireListing(id);
    assertListingTransition(listing.status, 'scheduled');

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.listing.update({ where: { id }, data: { status: 'scheduled' } });
      ctx.audit({
        action: 'LISTING_PUBLISHED',
        targetType: 'Listing',
        targetId: id,
        before: { status: listing.status },
        after: { status: 'scheduled' },
      });
      ctx.emit({
        name: DomainEventName.ListingPublished,
        aggregateType: 'Listing',
        aggregateId: id,
        payload: { listingId: id, assetId: listing.assetId, publicRef: listing.publicRef },
      });
      return updated;
    });
  }

  private async requireListing(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }
}
