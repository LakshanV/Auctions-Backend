import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  Permission,
  type RecordProductEventInput,
  recordProductEventSchema,
} from '@singha/contracts';
import { MeService } from './me.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Buyer command centre (consolidated pack doc 05). Owns the absolute
 * `api/v2/me` path (excluded from the global `api/v1` prefix in main.ts) so it
 * sits alongside the v2 catalogue. The projection is per-caller and
 * server-authorized — you only ever see your own dashboard.
 */
@Controller('api/v2/me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('dashboard')
  @RequirePermissions(Permission.WatchManage)
  dashboard(@CurrentActor() principal: Principal) {
    return this.me.dashboard(principal);
  }

  /**
   * Privacy-safe dashboard-pilot instrumentation (pack doc 09), gated on
   * `dashboardV3Beta`. Open to signed-in and anonymous callers; records only surface +
   * action + optional listing/funnel step. Never PII.
   */
  @Post('analytics')
  analytics(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(recordProductEventSchema)) input: RecordProductEventInput,
  ) {
    return this.me.recordAnalytics(principal, input);
  }
}
