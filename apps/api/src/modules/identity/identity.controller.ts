import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type LinkExternalIdentityInput,
  Permission,
  type RegisterCustomerInput,
  type SetKycInput,
  linkExternalIdentitySchema,
  registerCustomerSchema,
  setKycSchema,
} from '@singha/contracts';
import { IdentityService } from './identity.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { RequireAssurance } from '../../shared/auth/require-assurance.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

@Controller('customers')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  /** Self-service registration — creates a customer (verified facts only).
   *  Throttled hard to stop mass account creation / enumeration (§02/§04). */
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  register(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(registerCustomerSchema)) input: RegisterCustomerInput,
  ) {
    return this.identity.register(principal, input);
  }

  @Get(':id')
  get(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.identity.get(principal, id);
  }

  @Post(':id/external-identities')
  link(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(linkExternalIdentitySchema)) input: LinkExternalIdentityInput,
  ) {
    return this.identity.linkExternalIdentity(principal, id, input);
  }

  @Post(':id/kyc')
  @RequirePermissions(Permission.KycManage)
  @RequireAssurance()
  setKyc(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(setKycSchema)) input: SetKycInput,
  ) {
    return this.identity.setKyc(principal, id, input);
  }
}
