import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type CreateCampaignInput,
  type CreatePublicationInput,
  Permission,
  createCampaignSchema,
  createPublicationSchema,
} from '@singha/contracts';
import { SocialService } from './social.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/** Singha Social Publisher API (docs/11). All routes need `social:operate`. */
@Controller('social')
@RequirePermissions(Permission.SocialOperate)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Post('campaigns')
  createCampaign(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createCampaignSchema)) input: CreateCampaignInput,
  ) {
    return this.social.createCampaign(principal, input);
  }

  @Post('campaigns/:id/publish')
  publishCampaign(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.social.publishCampaign(principal, id);
  }

  @Post('publications')
  createPublication(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createPublicationSchema)) input: CreatePublicationInput,
  ) {
    return this.social.createPublication(principal, input);
  }

  @Post('publications/:id/publish')
  publish(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.social.publish(principal, id);
  }

  /** Hand a draft/scheduled post to a reviewer. Inherits class-level `social:operate`. */
  @Post('publications/:id/submit')
  submitForApproval(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.social.submitForApproval(principal, id);
  }

  /** Approve a pending post — the human gate publish() requires (docs/11). */
  @Post('publications/:id/approve')
  @RequirePermissions(Permission.SocialApprove)
  approve(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.social.approve(principal, id);
  }

  /** Send a pending post back to draft. */
  @Post('publications/:id/reject')
  @RequirePermissions(Permission.SocialApprove)
  reject(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.social.reject(principal, id);
  }

  @Get('listings/:id/publications')
  listForListing(@Param('id') id: string) {
    return this.social.listForListing(id);
  }
}
