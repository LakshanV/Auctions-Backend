import { Body, Controller, Get, type MessageEvent, Param, Post, Sse } from '@nestjs/common';
import { type Observable, concat, from, interval, of } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
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
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

@Controller('auctions')
export class AuctionController {
  constructor(private readonly auctions: AuctionService) {}

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
  close(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.auctions.close(principal, id);
  }

  /** Public, privacy-safe realtime projection (single fetch). */
  @Get(':id/state')
  state(@Param('id') id: string) {
    return this.auctions.getState(id);
  }

  /**
   * Realtime auction state as Server-Sent Events (pack doc 17). The client holds
   * one connection and receives a push whenever the state actually changes
   * (bid / soft-close extension / close), instead of polling. Public and
   * privacy-safe — the same projection as `/state`, never proxy maxima or bidder
   * identities. The server samples its own denormalized projection and only
   * emits on a real change.
   */
  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return concat(of(0), interval(2000)).pipe(
      switchMap(() => from(Promise.resolve(this.auctions.getState(id)))),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      map((data) => ({ data }) as MessageEvent),
    );
  }
}
