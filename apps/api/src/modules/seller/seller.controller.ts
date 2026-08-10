import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  type AddOrganizationMemberInput,
  type CreateOrganizationInput,
  Permission,
  addOrganizationMemberSchema,
  createOrganizationSchema,
} from '@singha/contracts';
import { SellerService } from './seller.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

@Controller('organizations')
export class SellerController {
  constructor(private readonly seller: SellerService) {}

  @Post()
  @RequirePermissions(Permission.OrganizationCreate)
  create(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createOrganizationSchema)) input: CreateOrganizationInput,
  ) {
    return this.seller.createOrganization(principal, input);
  }

  /** Ownership-authorized in the service (no static permission requirement). */
  @Post(':id/members')
  addMember(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(addOrganizationMemberSchema)) input: AddOrganizationMemberInput,
  ) {
    return this.seller.addMember(principal, id, input);
  }
}
