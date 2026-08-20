import { Controller, Get, Query } from '@nestjs/common';
import { type DashboardQuery, Permission, dashboardQuerySchema } from '@singha/contracts';
import { DashboardService } from './dashboard.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodQuery } from '../../shared/validation/zod.pipe';

/**
 * Cockpit (Dashboard) + Control Centre API (Evolution E11b, pack doc 11). Flag-gated (`dashboard` /
 * `controlCentre`) in the service. A member reads their own cockpit in one **explicit** context —
 * `?context=personal` (default) or `?context=organization&organizationId=…` — and the service
 * authorizes the organization context against real membership (or an `organization:manage` grant)
 * before reading a single row. An operator (`exchange:operate`) reads the operator-scoped Control
 * Centre overview. Both are read-only projections; all money is grouped by contractual currency.
 */
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  getDashboard(
    @CurrentActor() principal: Principal,
    @Query(new ZodQuery(dashboardQuerySchema)) query: DashboardQuery,
  ) {
    return this.dashboard.getDashboard(principal, query);
  }

  @Get('control-centre/overview')
  @RequirePermissions(Permission.ExchangeOperate)
  getControlCentre(
    @CurrentActor() principal: Principal,
    @Query('operatorCode') operatorCode?: string,
  ) {
    return this.dashboard.getControlCentreOverview(principal, operatorCode);
  }
}
