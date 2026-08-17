import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type AwardSealedOfferInput,
  type CounterOfferBody,
  Permission,
  type SubmitOfferInput,
  awardSealedOfferSchema,
  counterOfferBodySchema,
  submitOfferSchema,
} from '@singha/contracts';
import { OffersService } from './offers.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Commercial Offer Engine V2 API (Evolution E4, pack doc 08). Feature-gated in the service
 * (`commercialOffersV2`; sealed paths additionally `sealedOffers`) and authorised on the SERVER:
 * `exchange:participate` = buyers submit/withdraw; `exchange:operate-own` (RW5) = the owning
 * seller (a server-side listing-ownership check in the service, never a global grant) OR a
 * platform operator (`exchange:operate`) counter, reject, reveal, accept and award — a seller can
 * only ever touch their own listing's offers. Sealed selection defaults to MANUAL_SELECTION — the highest
 * proposal is never auto-awarded (DECISIONS D4).
 */
@Controller('commercial-offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  // --- buyer ----------------------------------------------------------------

  @Post()
  @RequirePermissions(Permission.ExchangeParticipate)
  submit(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(submitOfferSchema)) input: SubmitOfferInput,
  ) {
    return this.offers.submitOffer(principal, input);
  }

  @Get('mine')
  myOffers(@CurrentActor() principal: Principal) {
    return this.offers.myOffers(principal);
  }

  @Post(':id/withdraw')
  @RequirePermissions(Permission.ExchangeParticipate)
  withdraw(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.offers.withdrawOffer(principal, id);
  }

  // --- seller / operator ----------------------------------------------------

  @Post(':id/counter')
  @RequirePermissions(Permission.ExchangeOperateOwn)
  counter(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(counterOfferBodySchema)) body: CounterOfferBody,
  ) {
    return this.offers.counterOffer(principal, id, body);
  }

  @Post(':id/reject')
  @RequirePermissions(Permission.ExchangeOperateOwn)
  reject(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.offers.rejectOffer(principal, id);
  }

  @Post(':id/accept')
  @RequirePermissions(Permission.ExchangeOperateOwn)
  accept(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.offers.acceptOffer(principal, id);
  }

  @Get('listings/:listingId')
  @RequirePermissions(Permission.ExchangeOperateOwn)
  forListing(@CurrentActor() principal: Principal, @Param('listingId') listingId: string) {
    return this.offers.offersForListing(principal, listingId);
  }

  @Post('listings/:listingId/reveal')
  @RequirePermissions(Permission.ExchangeOperateOwn)
  reveal(@CurrentActor() principal: Principal, @Param('listingId') listingId: string) {
    return this.offers.revealSealed(principal, listingId);
  }

  @Post('listings/:listingId/award')
  @RequirePermissions(Permission.ExchangeOperateOwn)
  award(
    @CurrentActor() principal: Principal,
    @Param('listingId') listingId: string,
    @Body(new ZodBody(awardSealedOfferSchema)) input: AwardSealedOfferInput,
  ) {
    return this.offers.awardSealed(principal, listingId, input);
  }

  // --- participation (buyer-visible counts only, pre-reveal safe) ------------

  @Get('listings/:listingId/participation')
  @RequirePermissions(Permission.ExchangeParticipate)
  participation(@CurrentActor() principal: Principal, @Param('listingId') listingId: string) {
    return this.offers.sealedParticipation(principal, listingId);
  }
}
