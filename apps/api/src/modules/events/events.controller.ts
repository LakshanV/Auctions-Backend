import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  type AddEventLotInput,
  type CreateAuctionEventInput,
  Permission,
  addEventLotSchema,
  createAuctionEventSchema,
} from '@singha/contracts';
import { EventsService } from './events.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/** Auction events API (consolidated pack doc 06). Public reads; staff writes. */
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Public list of published events (optionally featured only). */
  @Get()
  list(@Query('featured') featured?: string) {
    return this.events.list(featured === 'true');
  }

  /** Public event page by id or publicRef. */
  @Get(':idOrRef')
  get(@Param('idOrRef') idOrRef: string) {
    return this.events.get(idOrRef);
  }

  @Post()
  @RequirePermissions(Permission.EventOperate)
  create(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createAuctionEventSchema)) input: CreateAuctionEventInput,
  ) {
    return this.events.create(principal, input);
  }

  @Post(':id/lots')
  @RequirePermissions(Permission.EventOperate)
  addLot(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(addEventLotSchema)) input: AddEventLotInput,
  ) {
    return this.events.addLot(principal, id, input);
  }

  @Post(':id/publish')
  @RequirePermissions(Permission.EventOperate)
  publish(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.events.publish(principal, id);
  }
}
