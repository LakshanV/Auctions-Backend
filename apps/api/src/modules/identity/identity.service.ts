import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DomainEventName,
  type LinkExternalIdentityInput,
  Permission,
  type RegisterCustomerInput,
  type SetKycInput,
  newId,
} from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

/** Identity module (docs/05): verified facts only; AI intelligence lives elsewhere. */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {}

  async register(principal: Principal, input: RegisterCustomerInput) {
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const customer = await ctx.tx.customer.create({
        data: {
          id,
          status: 'prospect',
          legalName: input.legalName,
          email: input.email,
          phone: input.phone,
          kycStatus: 'none',
        },
      });
      ctx.audit({ action: 'CUSTOMER_REGISTERED', targetType: 'Customer', targetId: id });
      return customer;
    });
  }

  async get(principal: Principal, id: string) {
    const canReadAny = principal.permissions.has(Permission.CustomerRead);
    if (!canReadAny && principal.customerId !== id) {
      throw new ForbiddenException('Not permitted to read this customer');
    }
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async linkExternalIdentity(
    principal: Principal,
    customerId: string,
    input: LinkExternalIdentityInput,
  ) {
    const canManageAny = principal.permissions.has(Permission.CustomerManage);
    if (!canManageAny && principal.customerId !== customerId) {
      throw new ForbiddenException('Not permitted to modify this customer');
    }
    const existing = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!existing) throw new NotFoundException('Customer not found');

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const identity = await ctx.tx.externalIdentity.create({
        data: { id: newId(), customerId, channel: input.channel, externalId: input.externalId },
      });
      ctx.audit({
        action: 'EXTERNAL_IDENTITY_LINKED',
        targetType: 'Customer',
        targetId: customerId,
        after: { channel: input.channel },
      });
      return identity;
    });
  }

  async setKyc(principal: Principal, customerId: string, input: SetKycInput) {
    const existing = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!existing) throw new NotFoundException('Customer not found');

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.customer.update({
        where: { id: customerId },
        data: { kycStatus: input.status },
      });
      ctx.audit({
        action: 'KYC_STATUS_CHANGED',
        targetType: 'Customer',
        targetId: customerId,
        before: { kycStatus: existing.kycStatus },
        after: { kycStatus: input.status },
      });
      if (input.status === 'verified') {
        ctx.emit({
          name: DomainEventName.CustomerVerified,
          aggregateType: 'Customer',
          aggregateId: customerId,
          payload: { customerId },
        });
      }
      return updated;
    });
  }
}
