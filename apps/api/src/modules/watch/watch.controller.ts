import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Permission, type WatchInput, watchSchema } from '@singha/contracts';
import { WatchService } from './watch.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/** Authoritative watchlist API (consolidated pack doc 06). */
@Controller('watch')
export class WatchController {
  constructor(private readonly watch: WatchService) {}

  @Get()
  @RequirePermissions(Permission.WatchManage)
  mine(@CurrentActor() principal: Principal) {
    return this.watch.mine(principal);
  }

  @Post()
  @RequirePermissions(Permission.WatchManage)
  add(@CurrentActor() principal: Principal, @Body(new ZodBody(watchSchema)) input: WatchInput) {
    return this.watch.add(principal, input.listingId);
  }

  @Delete(':listingId')
  @RequirePermissions(Permission.WatchManage)
  remove(@CurrentActor() principal: Principal, @Param('listingId') listingId: string) {
    return this.watch.remove(principal, listingId);
  }

  /** Public watcher count (no identities). */
  @Get(':listingId/count')
  count(@Param('listingId') listingId: string) {
    return this.watch.countFor(listingId);
  }
}
