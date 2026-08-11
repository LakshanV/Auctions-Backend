import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type CreateBidIntentInput,
  type InboundMessageInput,
  Permission,
  type SendMessageInput,
  type SetAiModeInput,
  createBidIntentSchema,
  inboundMessageSchema,
  sendMessageSchema,
  setAiModeSchema,
} from '@singha/contracts';
import { ConnectService } from './connect.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Singha Connect API (docs/09). Channel operations require `connect:operate`
 * (staff/support/mock webhook); bid intents use `bid:place` (the buyer).
 */
@Controller('connect')
export class ConnectController {
  constructor(private readonly connect: ConnectService) {}

  @Post('inbound')
  @RequirePermissions(Permission.ConnectOperate)
  inbound(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(inboundMessageSchema)) input: InboundMessageInput,
  ) {
    return this.connect.inbound(principal, input);
  }

  @Get('conversations/:id')
  @RequirePermissions(Permission.ConnectOperate)
  conversation(@Param('id') id: string) {
    return this.connect.conversation(id);
  }

  @Post('conversations/:id/messages')
  @RequirePermissions(Permission.ConnectOperate)
  send(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(sendMessageSchema)) input: SendMessageInput,
  ) {
    return this.connect.send(principal, id, input);
  }

  @Post('conversations/:id/mode')
  @RequirePermissions(Permission.ConnectOperate)
  setMode(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(setAiModeSchema)) input: SetAiModeInput,
  ) {
    return this.connect.setMode(principal, id, input);
  }

  @Post('bid-intents')
  @RequirePermissions(Permission.BidPlace)
  createBidIntent(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createBidIntentSchema)) input: CreateBidIntentInput,
  ) {
    return this.connect.createBidIntent(principal, input);
  }

  @Post('bid-intents/:id/confirm')
  @RequirePermissions(Permission.BidPlace)
  confirmBidIntent(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.connect.confirmBidIntent(principal, id);
  }
}
