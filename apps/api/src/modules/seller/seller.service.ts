import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AddOrganizationMemberInput,
  type CreateOrganizationInput,
  Permission,
  newId,
} from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

/** Seller/Vendor module (docs/03): organizations and their members. */
@Injectable()
export class SellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {}

  async createOrganization(principal: Principal, input: CreateOrganizationInput) {
    const actor = toActor(principal);
    const orgId = newId();
    return this.uow.execute(actor, async (ctx) => {
      const org = await ctx.tx.organization.create({
        data: { id: orgId, legalName: input.legalName, publicRef: input.publicRef },
      });
      // The creator (if a real customer) becomes the owner member.
      if (principal.customerId) {
        await ctx.tx.organizationMember.create({
          data: {
            id: newId(),
            organizationId: orgId,
            customerId: principal.customerId,
            role: 'owner',
          },
        });
      }
      ctx.audit({ action: 'ORGANIZATION_CREATED', targetType: 'Organization', targetId: orgId });
      return org;
    });
  }

  async addMember(principal: Principal, organizationId: string, input: AddOrganizationMemberInput) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');

    // Authorization: staff with organization:manage, OR an owner/admin of THIS org
    // (ownership check — prevents IDOR across organizations).
    const canManageAny = principal.permissions.has(Permission.OrganizationManage);
    if (!canManageAny) {
      const membership = principal.customerId
        ? await this.prisma.organizationMember.findFirst({
            where: {
              organizationId,
              customerId: principal.customerId,
              role: { in: ['owner', 'admin'] },
            },
          })
        : null;
      if (!membership) {
        throw new ForbiddenException('Not permitted to manage this organization');
      }
    }

    const target = await this.prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!target) throw new NotFoundException('Customer not found');

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const member = await ctx.tx.organizationMember.create({
        data: {
          id: newId(),
          organizationId,
          customerId: input.customerId,
          role: input.role,
        },
      });
      ctx.audit({
        action: 'ORGANIZATION_MEMBER_ADDED',
        targetType: 'Organization',
        targetId: organizationId,
        after: { customerId: input.customerId, role: input.role },
      });
      return member;
    });
  }
}
