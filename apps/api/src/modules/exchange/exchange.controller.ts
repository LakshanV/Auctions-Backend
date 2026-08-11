import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type MakeOfferInput,
  Permission,
  type RespondOfferInput,
  type SetBuyNowPriceInput,
  type SubmitTenderInput,
  makeOfferSchema,
  respondOfferSchema,
  setBuyNowPriceSchema,
  submitTenderSchema,
} from '@singha/contracts';
import { ExchangeService } from './exchange.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Exchange API (docs/07): Buy Now, Make Offer, Sealed Tender. Feature-gated in
 * the service; authorization enforced on the SERVER. `exchange:participate` =
 * buyers, `exchange:operate` = staff.
 */
@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchange: ExchangeService) {}

  // Buy Now
  @Post('listings/:id/buy-now-price')
  @RequirePermissions(Permission.ExchangeOperate)
  setBuyNowPrice(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(setBuyNowPriceSchema)) input: SetBuyNowPriceInput,
  ) {
    return this.exchange.setBuyNowPrice(principal, id, input);
  }

  @Post('listings/:id/buy-now')
  @RequirePermissions(Permission.ExchangeParticipate)
  buyNow(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.exchange.buyNow(principal, id);
  }

  // Make Offer
  @Post('listings/:id/offers')
  @RequirePermissions(Permission.ExchangeParticipate)
  makeOffer(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(makeOfferSchema)) input: MakeOfferInput,
  ) {
    return this.exchange.makeOffer(principal, id, input);
  }

  @Get('offers/mine')
  myOffers(@CurrentActor() principal: Principal) {
    return this.exchange.myOffers(principal);
  }

  @Get('listings/:id/offers')
  @RequirePermissions(Permission.ExchangeOperate)
  offersForListing(@Param('id') id: string) {
    return this.exchange.offersForListing(id);
  }

  @Post('offers/:id/respond')
  @RequirePermissions(Permission.ExchangeOperate)
  respondOffer(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(respondOfferSchema)) input: RespondOfferInput,
  ) {
    return this.exchange.respondOffer(principal, id, input);
  }

  @Post('offers/:id/withdraw')
  @RequirePermissions(Permission.ExchangeParticipate)
  withdrawOffer(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.exchange.withdrawOffer(principal, id);
  }

  // Sealed Tender
  @Post('listings/:id/tender-bids')
  @RequirePermissions(Permission.ExchangeParticipate)
  submitTender(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(submitTenderSchema)) input: SubmitTenderInput,
  ) {
    return this.exchange.submitTender(principal, id, input);
  }

  @Post('listings/:id/tender/open')
  @RequirePermissions(Permission.ExchangeOperate)
  openTender(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.exchange.openTender(principal, id);
  }

  @Get('listings/:id/tender-bids')
  @RequirePermissions(Permission.ExchangeOperate)
  tenderBids(@Param('id') id: string) {
    return this.exchange.tenderBids(id);
  }
}
