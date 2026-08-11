import { Body, Controller, Get, type MessageEvent, Param, Post, Sse } from '@nestjs/common';
import { type Observable, concat, from, interval, merge } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { AuctionRealtimeGateway } from './auction-realtime.gateway';
import {
  type CreateAuctionInput,
  Permission,
  type PlaceBidInput,
  createAuctionSchema,
  placeBidSchema,
} from '@singha/contracts';
import { AuctionService } from './auction.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { RequireAssurance } from '../../shared/auth/require-assurance.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

@Controller('auctions')
export class AuctionController {
  constructor(
    private readonly auctions: AuctionService,
    private readonly realtime: AuctionRealtimeGateway,
  ) {}

  @Post()
  @RequirePermissions(Permission.AuctionConfigure)
  create(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createAuctionSchema)) input: CreateAuctionInput,
  ) {
    return this.auctions.createAuction(principal, input);
  }

  @Post(':id/open')
  @RequirePermissions(Permission.AuctionOperate)
  @RequireAssurance()
  open(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.auctions.open(principal, id);
  }

  @Post(':id/bids')
  @RequirePermissions(Permission.BidPlace)
  placeBid(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(placeBidSchema)) input: PlaceBidInput,
  ) {
    return this.auctions.placeBid(principal, id, input);
  }

  @Post(':id/close')
  @RequirePermissions(Permission.AuctionOperate)
  @RequireAssurance()
  close(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.auctions.close(principal, id);
  }

  /** Public, privacy-safe realtime projection (single fetch). */
  @Get(':id/state')
  state(@Param('id') id: string) {
    return this.auctions.getState(id);
  }

  /**
   * Realtime auction state as Server-Sent Events (pack 01 doc 07). Shared
   * fan-out, not per-viewer polling: every subscriber of an auction receives the
   * SAME post-commit frames from `AuctionRealtimeGateway`, so a bid fans out to
   * all viewers without N×DB polling amplification.
   *
   * On connect the client gets one authoritative snapshot, then live frames.
   * A slow 20s poll is merged purely as a resilience fallback (a missed push or
   * a fan-out gap still self-heals) — it is not the primary transport. Public and
   * privacy-safe: the same projection as `/state`, never proxy maxima or bidder
   * identities. `version` lets the client order/dedupe frames.
   */
  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    const snapshot$ = from(Promise.resolve(this.auctions.getState(id)));
    const live$ = this.realtime.subscribe(id);
    const fallback$ = interval(20000).pipe(
      switchMap(() => from(Promise.resolve(this.auctions.getState(id)))),
    );
    return concat(snapshot$, merge(live$, fallback$)).pipe(
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      map((data) => ({ data }) as MessageEvent),
    );
  }
}
