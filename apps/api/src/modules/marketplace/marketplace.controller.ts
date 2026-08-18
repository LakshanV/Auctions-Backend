import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type CreateListingInput,
  Permission,
  type QualityCheckInput,
  type ReviewListingInput,
  type UpdateListingContentInput,
  createListingSchema,
  qualityCheckInputSchema,
  reviewListingSchema,
  updateListingContentSchema,
} from '@singha/contracts';
import { Patch } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { ListingQualityService } from './listing-quality.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { RequireAssurance } from '../../shared/auth/require-assurance.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

@Controller('listings')
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly quality: ListingQualityService,
  ) {}

  /**
   * §6/§7 — stateless pre-publish quality check. The seller posts the draft facts (before the
   * listing exists) and gets a deterministic, ADVISORY readiness assessment back. Nothing is
   * stored and no listing is touched — it only scores the facts provided.
   */
  @Post('quality-check')
  @HttpCode(200)
  @RequirePermissions(Permission.ListingSubmit)
  qualityCheck(@Body(new ZodBody(qualityCheckInputSchema)) input: QualityCheckInput) {
    return this.quality.fromInput(input);
  }

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
  @RequireAssurance()
  review(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(reviewListingSchema)) input: ReviewListingInput,
  ) {
    return this.marketplace.review(principal, id, input);
  }

  @Post(':id/publish')
  @RequirePermissions(Permission.ListingPublish)
  @RequireAssurance()
  publish(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.marketplace.publish(principal, id);
  }

  /**
   * §6/§7 — the quality assessment recomputed from a persisted listing (owner or staff). Staff use
   * it at review; the seller can re-check their own submitted listing. Advisory, read-only.
   */
  @Get(':id/quality-check')
  @RequirePermissions(Permission.ListingSubmit)
  qualityForListing(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.marketplace.qualityForListing(principal, id);
  }
}
