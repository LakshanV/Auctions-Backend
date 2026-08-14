import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { type RecordDiscoveryEventInput, recordDiscoveryEventSchema } from '@singha/contracts';
import { DiscoveryService } from './discovery.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Singha Discover API (pack docs 06/11). Recording + feed are open (a signed-out
 * session can browse Discover and record anonymous signals); the Buyer Twin summary
 * and preference reset require an authenticated customer (checked in-service). No
 * ranking weights or raw scores are ever returned.
 */
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Post('events')
  record(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(recordDiscoveryEventSchema)) input: RecordDiscoveryEventInput,
  ) {
    return this.discovery.recordEvent(principal, input);
  }

  @Get('feed')
  feed(@CurrentActor() principal: Principal, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 20, 1), 40);
    return this.discovery.feed(principal, n);
  }

  /** The caller's own Buyer Twin summary (safe fields only). */
  @Get('buyer-twin')
  buyerTwin(@CurrentActor() principal: Principal) {
    return this.discovery.myBuyerTwin(principal);
  }

  @Post('preferences/reset')
  reset(@CurrentActor() principal: Principal) {
    return this.discovery.resetPreferences(principal);
  }
}
