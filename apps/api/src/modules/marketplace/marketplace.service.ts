import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateListingInput,
  DomainEventName,
  type ReviewListingInput,
  newId,
} from '@singha/contracts';
import { assertListingTransition } from '@singha/domain';
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
          publicRef: input.publicRef,
          title: input.title,
          status: 'draft',
        },
      });
      ctx.audit({ action: 'LISTING_CREATED', targetType: 'Listing', targetId: id });
      return listing;
    });
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
