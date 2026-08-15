import { Controller, Get, Query } from '@nestjs/common';
import { Permission } from '@singha/contracts';
import { DashboardService } from './dashboard.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';

/**
 * Dashboard + Control Centre API (Evolution E11b, pack doc 11). Flag-gated (`dashboard` /
 * `controlCentre`) in the service. A member reads their own dashboard; an operator
 * (`exchange:operate`) reads the operator-scoped Control Centre overview. Both are read-only
 * projections.
 */
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  getDashboard(@CurrentActor() principal: Principal) {
    return this.dashboard.getDashboard(principal);
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
