import { Controller, Get, Param, Query } from '@nestjs/common';
import { Permission } from '@singha/contracts';
import { IntelligenceService } from './intelligence.service';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { type Principal } from '../../shared/auth/principal';

/**
 * Asset Intelligence API (docs/12). Market Pulse is public (homepage, rule 13);
 * comparables + seller intelligence require `intelligence:read`.
 */
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  /** Public homepage Market Pulse. */
  @Get('market-pulse')
  marketPulse(@Query('days') days?: string) {
    // Clamp BOTH ends: this is public/anonymous, and a large negative `days` used to flow
    // through to `new Date(Date.now() - days*86_400_000)` → an out-of-range Invalid Date →
    // Prisma 500. Bound to [1, 365].
    const window = days ? Math.max(1, Math.min(Number(days) || 90, 365)) : 90;
    return this.intelligence.marketPulse(window);
  }

  @Get('comparables')
  @RequirePermissions(Permission.IntelligenceRead)
  comparables(@Query('category') category: string, @Query('limit') limit?: string) {
    return this.intelligence.comparables(category, limit ? Number(limit) || 10 : 10);
  }

  @Get('assets/:id/insights')
  @RequirePermissions(Permission.IntelligenceRead)
  assetInsights(@Param('id') id: string) {
    return this.intelligence.assetInsights(id);
  }

  @Get('sellers/:orgId')
  @RequirePermissions(Permission.IntelligenceRead)
  sellerIntelligence(@CurrentActor() principal: Principal, @Param('orgId') orgId: string) {
    // intelligence:read alone is held by every seller; an org's sold performance is
    // competitively sensitive, so the SERVICE additionally requires the caller to be an
    // owner/admin member of that org (or staff) — otherwise a seller could read a rival's
    // revenue. (BOLA fix.)
    return this.intelligence.sellerIntelligence(principal, orgId);
  }
}
