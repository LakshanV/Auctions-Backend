import {
  Body,
  Controller,
  Get,
  type MessageEvent,
  NotFoundException,
  Param,
  Post,
  Sse,
} from '@nestjs/common';
import { type Observable, concat, from, interval } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import {
  type CreateLiveEventInput,
  type FloorBidInput,
  Permission,
  createLiveEventSchema,
  floorBidSchema,
} from '@singha/contracts';
import { LiveService } from './live.service';
import { AppConfigService } from '../../config/config.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Singha Live API (docs/08), gated on `liveV3`. Auctioneer/clerk/producer operations
 * require `live:operate`; playback + room state are public. When the flag is OFF the whole
 * surface 404s, so the live experience stays hidden until its phase gate opens.
 */
@Controller('live')
export class LiveController {
  constructor(
    private readonly live: LiveService,
    private readonly config: AppConfigService,
  ) {}

  private ensureEnabled() {
    if (!this.config.get().features.liveV3) throw new NotFoundException('Not found');
  }

  @Post('events')
  @RequirePermissions(Permission.LiveOperate)
  create(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createLiveEventSchema)) input: CreateLiveEventInput,
  ) {
    this.ensureEnabled();
    return this.live.createEvent(principal, input);
  }

  @Post('events/:id/start')
  @RequirePermissions(Permission.LiveOperate)
  start(@CurrentActor() principal: Principal, @Param('id') id: string) {
    this.ensureEnabled();
    return this.live.start(principal, id);
  }

  @Post('events/:id/simulcast')
  @RequirePermissions(Permission.LiveOperate)
  simulcast(@CurrentActor() principal: Principal, @Param('id') id: string) {
    this.ensureEnabled();
    return this.live.simulcast(principal, id);
  }

  @Post('events/:id/stop')
  @RequirePermissions(Permission.LiveOperate)
  stop(@CurrentActor() principal: Principal, @Param('id') id: string) {
    this.ensureEnabled();
    return this.live.stop(principal, id);
  }

  /** Clerk relays a floor/phone bid into the one ledger. */
  @Post('floor-bid')
  @RequirePermissions(Permission.LiveOperate)
  floorBid(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(floorBidSchema)) input: FloorBidInput,
  ) {
    this.ensureEnabled();
    return this.live.floorBid(principal, input);
  }

  /** Public bidder-room state (playback + status). */
  @Get('events/:id')
  get(@Param('id') id: string) {
    this.ensureEnabled();
    return this.live.get(id);
  }

  /** Public canonical live-room projection: status + video availability + bid state. */
  @Get('events/:id/room')
  room(@Param('id') id: string) {
    this.ensureEnabled();
    return this.live.liveRoom(id);
  }

  /**
   * Public live-room stream (pack doc 08 realtime). On connect the client gets one
   * authoritative snapshot, then refreshed frames; `seq` (the auction engine version)
   * lets the client order/dedupe, so reconnect/resync is deterministic and duplicate
   * frames are harmless. Bid state comes from the engine — a video outage never stops it.
   */
  @Sse('events/:id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    this.ensureEnabled();
    const room$ = () => from(this.live.liveRoom(id));
    return concat(room$(), interval(2000).pipe(switchMap(() => room$()))).pipe(
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      map((data) => ({ data }) as MessageEvent),
    );
  }
}
