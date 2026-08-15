import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type OriginateInput,
  Permission,
  type SeoCanonicalInput,
  type SeoListingInput,
  originateSchema,
  seoCanonicalSchema,
  seoListingSchema,
} from '@singha/contracts';
import { NodeService } from './node.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Satellite Market Node + SEO API (Evolution E13, Addendum A + doc 11). Flag-gated (`satelliteNodes`)
 * in the service. Node presentation, Discovery routing and SEO are public marketing surfaces;
 * origination is operator-only and never binds locally — the canonical record lives centrally.
 */
@Controller()
export class NodeController {
  constructor(private readonly nodes: NodeService) {}

  @Get('nodes/:code')
  getNode(@Param('code') code: string) {
    return this.nodes.getNode(code);
  }

  @Get('nodes/:code/discovery')
  discovery(@Param('code') code: string) {
    return this.nodes.discovery(code);
  }

  @Post('nodes/:code/originate')
  @RequirePermissions(Permission.ExchangeOperate)
  originate(
    @CurrentActor() principal: Principal,
    @Param('code') code: string,
    @Body(new ZodBody(originateSchema)) input: OriginateInput,
  ) {
    return this.nodes.originate(principal, code, input);
  }

  @Post('seo/canonical')
  seoCanonical(@Body(new ZodBody(seoCanonicalSchema)) input: SeoCanonicalInput) {
    return this.nodes.seoCanonical(input);
  }

  @Post('seo/listing-jsonld')
  seoListing(@Body(new ZodBody(seoListingSchema)) input: SeoListingInput) {
    return this.nodes.seoListing(input);
  }
}
