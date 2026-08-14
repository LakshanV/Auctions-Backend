import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type ApplyDraftInput,
  type AssistInput,
  type DraftListingInput,
  type TranslateInput,
  Permission,
  applyDraftSchema,
  assistSchema,
  draftListingSchema,
  translateSchema,
} from '@singha/contracts';
import { AiService } from './ai.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Singha AI Core API (docs/10). All routes need `ai:use`. Outputs are derived
 * records; applying a draft mutates a listing only through an explicit call.
 */
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('listing-draft')
  @RequirePermissions(Permission.AiUse)
  draftListing(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(draftListingSchema)) input: DraftListingInput,
  ) {
    return this.ai.draftListing(principal, input);
  }

  @Post('assist')
  @RequirePermissions(Permission.AiUse)
  assist(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(assistSchema)) input: AssistInput,
  ) {
    return this.ai.assist(principal, input);
  }

  @Post('translate')
  @RequirePermissions(Permission.AiUse)
  translate(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(translateSchema)) input: TranslateInput,
  ) {
    return this.ai.translate(principal, input);
  }

  @Get('runs/:id')
  @RequirePermissions(Permission.AiUse)
  getRun(@Param('id') id: string) {
    return this.ai.getRun(id);
  }

  @Post('runs/:id/apply')
  @RequirePermissions(Permission.ListingPublish)
  applyDraft(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(applyDraftSchema)) input: ApplyDraftInput,
  ) {
    return this.ai.applyDraft(principal, id, input);
  }
}
