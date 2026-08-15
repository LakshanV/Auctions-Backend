import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  type DecideCapabilityInput,
  Permission,
  type RequestCapabilityInput,
  type UpdateSinghaProfileInput,
  decideCapabilitySchema,
  requestCapabilitySchema,
  updateSinghaProfileSchema,
} from '@singha/contracts';
import { SinghaIdService } from './singha-id.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Singha ID API (Evolution E11, pack doc 11). Flag-gated (`singhaId`) in the service. Members manage
 * their own profile + request capabilities (`exchange:participate`); an operator decides a pending
 * capability (`exchange:operate`). Verification is capability-based — a gated activity requires a
 * verified, unexpired grant.
 */
@Controller('singha-id')
export class SinghaIdController {
  constructor(private readonly singhaId: SinghaIdService) {}

  @Get('profile')
  getProfile(@CurrentActor() principal: Principal) {
    return this.singhaId.getProfile(principal);
  }

  @Put('profile')
  @RequirePermissions(Permission.ExchangeParticipate)
  updateProfile(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(updateSinghaProfileSchema)) input: UpdateSinghaProfileInput,
  ) {
    return this.singhaId.updateProfile(principal, input);
  }

  @Get('capabilities')
  listCapabilities(@CurrentActor() principal: Principal) {
    return this.singhaId.listCapabilities(principal);
  }

  @Post('capabilities')
  @RequirePermissions(Permission.ExchangeParticipate)
  requestCapability(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(requestCapabilitySchema)) input: RequestCapabilityInput,
  ) {
    return this.singhaId.requestCapability(principal, input);
  }

  @Post('capabilities/decide')
  @RequirePermissions(Permission.ExchangeOperate)
  decide(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(decideCapabilitySchema)) input: DecideCapabilityInput,
  ) {
    return this.singhaId.decide(principal, input);
  }

  @Get('evaluate/:activity')
  evaluate(@CurrentActor() principal: Principal, @Param('activity') activity: string) {
    return this.singhaId.evaluate(principal, activity);
  }
}
