import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AskAssistantInput,
  type AssistantChannelRequestInput,
  Permission,
  askAssistantSchema,
  assistantChannelRequestSchema,
} from '@singha/contracts';
import { AssistantService } from './assistant.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * AIC-1/AIC-2 — customer-facing AI conversation assistant + cross-channel continuity (docs/10
 * "Customer AI"). Non-binding: the assistant answers/suggests only — every route requires the
 * customer-scoped `ai:converse` permission (never `ai:use`/`connect:operate`, which stay
 * staff-only) and is rate-limited.
 */
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('message')
  @RequirePermissions(Permission.AiConverse)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  ask(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(askAssistantSchema)) input: AskAssistantInput,
  ) {
    return this.assistant.ask(principal, input);
  }

  @Get('conversations/:id')
  @RequirePermissions(Permission.AiConverse)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  getConversation(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.assistant.getConversation(principal, id);
  }

  /**
   * AIC-2 — "Chat now / WhatsApp / Call me". Same permission + ownership posture as the routes
   * above (`ai:converse`, service-side ownership via `resolveConversationId`, `requireFeature`);
   * additionally capability-gated by config `assistantChannels` (AssistantService.channelRequest).
   */
  @Post('channel-request')
  @RequirePermissions(Permission.AiConverse)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  channelRequest(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(assistantChannelRequestSchema)) input: AssistantChannelRequestInput,
  ) {
    return this.assistant.channelRequest(principal, input);
  }
}
