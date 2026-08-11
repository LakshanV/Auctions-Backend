import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type CreateLiveEventInput,
  type FloorBidInput,
  Permission,
  createLiveEventSchema,
  floorBidSchema,
} from '@singha/contracts';
import { LiveService } from './live.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Singha Live API (docs/08). Auctioneer/clerk/producer operations require
 * `live:operate`. Playback state is readable by anyone (the room is public).
 */
@Controller('live')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Post('events')
  @RequirePermissions(Permission.LiveOperate)
  create(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createLiveEventSchema)) input: CreateLiveEventInput,
  ) {
    return this.live.createEvent(principal, input);
  }

  @Post('events/:id/start')
  @RequirePermissions(Permission.LiveOperate)
  start(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.live.start(principal, id);
  }

  @Post('events/:id/simulcast')
  @RequirePermissions(Permission.LiveOperate)
  simulcast(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.live.simulcast(principal, id);
  }

  @Post('events/:id/stop')
  @RequirePermissions(Permission.LiveOperate)
  stop(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.live.stop(principal, id);
  }

  /** Clerk relays a floor/phone bid into the one ledger. */
  @Post('floor-bid')
  @RequirePermissions(Permission.LiveOperate)
  floorBid(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(floorBidSchema)) input: FloorBidInput,
  ) {
    return this.live.floorBid(principal, input);
  }

  /** Public bidder-room state (playback + status). */
  @Get('events/:id')
  get(@Param('id') id: string) {
    return this.live.get(id);
  }
}
