import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type AiFeedbackInput,
  type ApplyDraftInput,
  type AssistInput,
  type DraftListingInput,
  type TranslateInput,
  Permission,
  aiFeedbackSchema,
  applyDraftSchema,
  assistSchema,
  draftListingSchema,
  translateSchema,
} from '@singha/contracts';
import { HttpCode } from '@nestjs/common';
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

  /**
   * §8 — record a human's verdict on an AI run (accepted / corrected / rejected). Append-only; the
   * AI output is never mutated. Closes the correction half of the evaluation loop.
   */
  @Post('runs/:id/feedback')
  @RequirePermissions(Permission.AiUse)
  recordFeedback(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(aiFeedbackSchema)) input: AiFeedbackInput,
  ) {
    return this.ai.recordFeedback(principal, id, input);
  }

  /** §8 — aggregated AI accuracy metrics from accumulated human feedback (advisory, read-only). */
  @Get('evaluation')
  @HttpCode(200)
  @RequirePermissions(Permission.AiUse)
  evaluation() {
    return this.ai.evaluation();
  }
}
