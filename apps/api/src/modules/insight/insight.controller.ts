import { Body, Controller, Post } from '@nestjs/common';
import {
  type CompareProposalsInput,
  type MatchCriteriaInput,
  Permission,
  type PriceComparablesInput,
  type RiskSignalsInput,
  compareProposalsSchema,
  matchCriteriaSchema,
  priceComparablesSchema,
  riskSignalsSchema,
} from '@singha/contracts';
import { InsightService } from './insight.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Singha Intelligence API (Evolution E12, pack doc 12). Flag-gated (`insightEngine`) in the service.
 * Matching / offer / pricing intelligence is available to participants; fraud/risk review is
 * operator-only. Every response is a derived, non-binding recommendation.
 */
@Controller('insight')
export class InsightController {
  constructor(private readonly insight: InsightService) {}

  @Post('match')
  @RequirePermissions(Permission.ExchangeParticipate)
  match(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(matchCriteriaSchema)) input: MatchCriteriaInput,
  ) {
    return this.insight.match(principal, input);
  }

  @Post('offers/compare')
  @RequirePermissions(Permission.ExchangeParticipate)
  compareOffers(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(compareProposalsSchema)) input: CompareProposalsInput,
  ) {
    return this.insight.compareOffers(principal, input);
  }

  @Post('pricing/comparables')
  @RequirePermissions(Permission.ExchangeParticipate)
  pricing(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(priceComparablesSchema)) input: PriceComparablesInput,
  ) {
    return this.insight.pricing(principal, input);
  }

  @Post('risk')
  @RequirePermissions(Permission.ExchangeOperate)
  risk(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(riskSignalsSchema)) input: RiskSignalsInput,
  ) {
    return this.insight.risk(principal, input);
  }
}
