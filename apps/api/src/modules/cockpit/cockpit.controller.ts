import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  type CockpitAskInput,
  type CockpitQuery,
  type CockpitTimelineQuery,
  cockpitAskSchema,
  cockpitQuerySchema,
  cockpitTimelineQuerySchema,
} from '@singha/contracts';
import { CockpitService } from './cockpit.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody, ZodQuery } from '../../shared/validation/zod.pipe';

/**
 * Singha Cockpit API. Owns the absolute `api/v2/me/cockpit` path (excluded from the global `api/v1`
 * prefix in main.ts). Every route is per-caller and self-scoped; `?org=<id>` selects an authorised
 * ORGANISATION context (the service verifies membership), `?display=<CUR>` requests informational
 * FX equivalents. There is no separate buyer/seller surface.
 */
@Controller('api/v2/me')
export class CockpitController {
  constructor(private readonly cockpit: CockpitService) {}

  @Get('cockpit')
  get(
    @CurrentActor() principal: Principal,
    @Query(new ZodQuery(cockpitQuerySchema)) query: CockpitQuery,
  ) {
    return this.cockpit.cockpit(principal, query);
  }

  @Get('cockpit/account-health')
  accountHealth(
    @CurrentActor() principal: Principal,
    @Query(new ZodQuery(cockpitQuerySchema)) query: CockpitQuery,
  ) {
    return this.cockpit.accountHealth(principal, query);
  }

  @Get('cockpit/timeline')
  timeline(
    @CurrentActor() principal: Principal,
    @Query(new ZodQuery(cockpitTimelineQuerySchema)) query: CockpitTimelineQuery,
  ) {
    return this.cockpit.timeline(principal, query);
  }

  @Post('cockpit/ask')
  ask(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(cockpitAskSchema)) input: CockpitAskInput,
    @Query(new ZodQuery(cockpitQuerySchema)) query: CockpitQuery,
  ) {
    return this.cockpit.ask(principal, input, query);
  }
}
