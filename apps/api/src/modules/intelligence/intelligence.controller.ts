import { Controller, Get, Param, Query } from '@nestjs/common';
import { Permission } from '@singha/contracts';
import { IntelligenceService } from './intelligence.service';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';

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
    return this.intelligence.marketPulse(days ? Math.min(Number(days) || 90, 365) : 90);
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
  sellerIntelligence(@Param('orgId') orgId: string) {
    return this.intelligence.sellerIntelligence(orgId);
  }
}
