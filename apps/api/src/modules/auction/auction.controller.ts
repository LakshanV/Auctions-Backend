import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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

  /** Public, privacy-safe realtime projection (poll; SSE/WS adapter is later). */
  @Get(':id/state')
  state(@Param('id') id: string) {
    return this.auctions.getState(id);
  }
}
