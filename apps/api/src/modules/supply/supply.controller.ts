import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type AttachPerishableInput,
  type CreateSupplyProgrammeInput,
  Permission,
  type RecommendSupplyInput,
  type SetSupplyProgrammeStatusInput,
  attachPerishableSchema,
  createSupplyProgrammeSchema,
  recommendSupplySchema,
  setSupplyProgrammeStatusSchema,
} from '@singha/contracts';
import { SupplyService } from './supply.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Supply Programmes + perishable API (Evolution E10, pack doc 09). Flag-gated (`supplyProgrammes` /
 * `perishableGoods`) in the service. `exchange:participate` — a supplier posts/manages recurring
 * availability and a buyer queries for matches. Matching returns a recommendation only; it awards
 * nothing (§09 / D4).
 */
@Controller('supply')
export class SupplyController {
  constructor(private readonly supply: SupplyService) {}

  @Post('programmes')
  @RequirePermissions(Permission.ExchangeParticipate)
  create(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createSupplyProgrammeSchema)) input: CreateSupplyProgrammeInput,
  ) {
    return this.supply.createProgramme(principal, input);
  }

  @Get('programmes/mine')
  mine(@CurrentActor() principal: Principal) {
    return this.supply.myProgrammes(principal);
  }

  @Get('programmes/:id')
  @RequirePermissions(Permission.ExchangeParticipate)
  get(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.supply.getProgramme(principal, id);
  }

  @Post('programmes/:id/status')
  @RequirePermissions(Permission.ExchangeParticipate)
  setStatus(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(setSupplyProgrammeStatusSchema)) input: SetSupplyProgrammeStatusInput,
  ) {
    return this.supply.setStatus(principal, id, input);
  }

  @Post('recommend')
  @RequirePermissions(Permission.ExchangeParticipate)
  recommend(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(recommendSupplySchema)) input: RecommendSupplyInput,
  ) {
    return this.supply.recommend(principal, input);
  }

  @Post('perishable')
  @RequirePermissions(Permission.ExchangeParticipate)
  attachPerishable(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(attachPerishableSchema)) input: AttachPerishableInput,
  ) {
    return this.supply.attachPerishable(principal, input);
  }

  @Get('perishable/:subjectType/:subjectId')
  @RequirePermissions(Permission.ExchangeParticipate)
  getPerishable(
    @CurrentActor() principal: Principal,
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
  ) {
    return this.supply.getPerishable(principal, subjectType, subjectId);
  }
}
