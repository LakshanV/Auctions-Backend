import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import {
  Permission,
  type SellerAuctionPreferenceInput,
  type SellerDraftUpsertInput,
  sellerAuctionPreferenceSchema,
  sellerDraftUpsertSchema,
} from '@singha/contracts';
import { SellerStudioService } from './seller-studio.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Resumable Listing Studio drafts (directive §25). Owner-scoped in the service; the
 * `listing:content` permission (held by sellers) gates the surface.
 */
@Controller('seller/drafts')
@RequirePermissions(Permission.ListingContent)
export class SellerDraftController {
  constructor(private readonly studio: SellerStudioService) {}

  @Get()
  list(@CurrentActor() principal: Principal) {
    return this.studio.listDrafts(principal);
  }

  @Get(':id')
  get(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.studio.getDraft(principal, id);
  }

  @Post()
  create(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(sellerDraftUpsertSchema)) input: SellerDraftUpsertInput,
  ) {
    return this.studio.createDraft(principal, input);
  }

  @Put(':id')
  save(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(sellerDraftUpsertSchema)) input: SellerDraftUpsertInput,
  ) {
    return this.studio.saveDraft(principal, id, input);
  }

  @Delete(':id')
  archive(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.studio.archiveDraft(principal, id);
  }
}

/**
 * A seller's requested auction settings for a listing (directive §7) — persisted
 * structurally (not a UI note) so staff approve/adjust before the authoritative
 * auction is created. Ownership enforced in the service.
 */
@Controller('listings')
@RequirePermissions(Permission.ListingContent)
export class SellerAuctionPreferenceController {
  constructor(private readonly studio: SellerStudioService) {}

  @Get(':id/auction-preference')
  get(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.studio.getAuctionPreference(principal, id);
  }

  @Put(':id/auction-preference')
  set(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(sellerAuctionPreferenceSchema)) input: SellerAuctionPreferenceInput,
  ) {
    return this.studio.setAuctionPreference(principal, id, input);
  }
}
