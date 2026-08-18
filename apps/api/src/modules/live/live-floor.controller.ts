import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import {
  type CallStageInput,
  type OpenLotInput,
  Permission,
  type WithdrawLotInput,
  callStageSchema,
  openLotSchema,
  withdrawLotSchema,
} from '@singha/contracts';
import { LiveFloorService } from './live-floor.service';
import { AppConfigService } from '../../config/config.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * §21/§22 (RW6) — the auctioneer's live floor console over an AuctionEvent's ordered lots. Mounted
 * under `events/:id/floor…` alongside the public events controller (distinct routes). Conduct
 * operations require `live:conduct` (the scoped auctioneer role; auction staff hold it too); the
 * floor read is public so the customer live-room consumes the SAME projection. Gated on `liveV3`
 * like the rest of Singha Live, so it stays hidden until that phase flag opens.
 */
@Controller('events')
export class LiveFloorController {
  constructor(
    private readonly floor: LiveFloorService,
    private readonly config: AppConfigService,
  ) {}

  private ensureEnabled() {
    if (!this.config.get().features.liveV3) throw new NotFoundException('Not found');
  }

  /** Public floor projection: ordered lots + live state + the current lot's authoritative bid. */
  @Get(':id/floor')
  floorState(@Param('id') id: string) {
    this.ensureEnabled();
    return this.floor.floorState(id);
  }

  @Post(':id/floor/open-lot')
  @RequirePermissions(Permission.LiveConduct)
  openLot(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(openLotSchema)) input: OpenLotInput,
  ) {
    this.ensureEnabled();
    return this.floor.openLot(principal, id, input.lotId);
  }

  @Post(':id/floor/call')
  @RequirePermissions(Permission.LiveConduct)
  call(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(callStageSchema)) input: CallStageInput,
  ) {
    this.ensureEnabled();
    return this.floor.call(principal, id, input.stage);
  }

  @Post(':id/floor/sell')
  @RequirePermissions(Permission.LiveConduct)
  sell(@CurrentActor() principal: Principal, @Param('id') id: string) {
    this.ensureEnabled();
    return this.floor.sell(principal, id);
  }

  @Post(':id/floor/pass')
  @RequirePermissions(Permission.LiveConduct)
  pass(@CurrentActor() principal: Principal, @Param('id') id: string) {
    this.ensureEnabled();
    return this.floor.pass(principal, id);
  }

  @Post(':id/floor/withdraw')
  @RequirePermissions(Permission.LiveConduct)
  withdraw(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(withdrawLotSchema)) input: WithdrawLotInput,
  ) {
    this.ensureEnabled();
    return this.floor.withdraw(principal, id, input.lotId);
  }

  @Post(':id/floor/next')
  @RequirePermissions(Permission.LiveConduct)
  next(@CurrentActor() principal: Principal, @Param('id') id: string) {
    this.ensureEnabled();
    return this.floor.next(principal, id);
  }
}
