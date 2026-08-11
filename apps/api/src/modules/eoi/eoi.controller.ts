import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  Permission,
  type ReviewEoiInput,
  type SubmitEoiInput,
  reviewEoiSchema,
  submitEoiSchema,
} from '@singha/contracts';
import { EoiService } from './eoi.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Expression-of-Interest API (docs/07 — EOI). Values are private; authorization
 * is enforced on the SERVER (permission guard + in-service ownership/role checks).
 */
@Controller()
export class EoiController {
  constructor(private readonly eoi: EoiService) {}

  @Post('eoi')
  @RequirePermissions(Permission.EoiSubmit)
  submit(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(submitEoiSchema)) input: SubmitEoiInput,
  ) {
    return this.eoi.submit(principal, input);
  }

  /** The caller's own EOIs. Authz enforced in-service (needs a customer). */
  @Get('eoi/mine')
  mine(@CurrentActor() principal: Principal) {
    return this.eoi.mine(principal);
  }

  /** A single EOI — submitter or staff only (checked in-service). */
  @Get('eoi/:id')
  get(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.eoi.get(principal, id);
  }

  @Post('eoi/:id/withdraw')
  @RequirePermissions(Permission.EoiSubmit)
  withdraw(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.eoi.withdraw(principal, id);
  }

  @Post('eoi/:id/review')
  @RequirePermissions(Permission.EoiReview)
  review(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(reviewEoiSchema)) input: ReviewEoiInput,
  ) {
    return this.eoi.review(principal, id, input);
  }

  /** Staff-only: all EOIs on a listing, with values (controlled review). */
  @Get('listings/:listingId/eoi')
  @RequirePermissions(Permission.EoiReview)
  forListing(@Param('listingId') listingId: string) {
    return this.eoi.listForListing(listingId);
  }
}
