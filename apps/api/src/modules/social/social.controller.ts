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

  @Get('listings/:id/publications')
  listForListing(@Param('id') id: string) {
    return this.social.listForListing(id);
  }
}
