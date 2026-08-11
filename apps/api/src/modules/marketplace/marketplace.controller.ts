import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type CreateListingInput,
  Permission,
  type ReviewListingInput,
  type UpdateListingContentInput,
  createListingSchema,
  reviewListingSchema,
  updateListingContentSchema,
} from '@singha/contracts';
import { Patch } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

@Controller('listings')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Post()
  @RequirePermissions(Permission.ListingCreate)
  create(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createListingSchema)) input: CreateListingInput,
  ) {
    return this.marketplace.createListing(principal, input);
  }

  /** Seller dashboard — the caller's own listings. */
  @Get('mine')
  @RequirePermissions(Permission.ListingCreate)
  mine(@CurrentActor() principal: Principal) {
    return this.marketplace.mine(principal);
  }

  /** Admin approvals — listings awaiting review/publish. */
  @Get('review-queue')
  @RequirePermissions(Permission.ListingReview)
  reviewQueue() {
    return this.marketplace.reviewQueue();
  }

  /** Edit public content + sale-mode display config (owner or staff). */
  @Patch(':id/content')
  @RequirePermissions(Permission.ListingContent)
  updateContent(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(updateListingContentSchema)) input: UpdateListingContentInput,
  ) {
    return this.marketplace.updateContent(principal, id, input);
  }

  @Post(':id/submit')
  @RequirePermissions(Permission.ListingSubmit)
  submit(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.marketplace.submit(principal, id);
  }

  @Post(':id/review')
  @RequirePermissions(Permission.ListingReview)
  review(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(reviewListingSchema)) input: ReviewListingInput,
  ) {
    return this.marketplace.review(principal, id, input);
  }

  @Post(':id/publish')
  @RequirePermissions(Permission.ListingPublish)
  publish(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.marketplace.publish(principal, id);
  }
}
