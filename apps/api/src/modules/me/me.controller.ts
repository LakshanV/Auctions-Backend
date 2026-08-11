import { Controller, Get } from '@nestjs/common';
import { Permission } from '@singha/contracts';
import { MeService } from './me.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';

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
}
