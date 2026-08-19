import { Body, Controller, Get, Post } from '@nestjs/common';
import { type CockpitAskInput, cockpitAskSchema } from '@singha/contracts';
import { CockpitService } from './cockpit.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Singha Cockpit API (unified-identity pass). Owns the absolute `api/v2/me/cockpit` path (excluded
 * from the global `api/v1` prefix in main.ts), alongside the v2 buyer command-centre. Every route
 * is per-caller and self-scoped — a signed-in client only ever sees their OWN cockpit; the service
 * requires `principal.customerId` (in-service auth), so there is no separate buyer/seller surface.
 */
@Controller('api/v2/me')
export class CockpitController {
  constructor(private readonly cockpit: CockpitService) {}

  @Get('cockpit')
  get(@CurrentActor() principal: Principal) {
    return this.cockpit.cockpit(principal);
  }

  @Get('cockpit/account-health')
  accountHealth(@CurrentActor() principal: Principal) {
    return this.cockpit.accountHealth(principal);
  }

  @Post('cockpit/ask')
  ask(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(cockpitAskSchema)) input: CockpitAskInput,
  ) {
    return this.cockpit.ask(principal, input);
  }
}
