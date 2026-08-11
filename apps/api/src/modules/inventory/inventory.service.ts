import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CURRENT_CATEGORY_VERSION,
  type CreateAssetInput,
  Permission,
  type UpdateAssetAttributesInput,
  isCategoryKey,
  newId,
  validateAssetAttributes,
} from '@singha/contracts';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

/** Inventory module (docs/06): enduring Asset records with validated attributes. */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {}

  async createAsset(principal: Principal, input: CreateAssetInput) {
    const validation = validateAssetAttributes(input.category, input.attributes);
    if (!validation.success) throw new BadRequestException(validation.errors);

    const actor = toActor(principal);
    const id = newId();
    const ownerCustomerId = input.ownerCustomerId ?? principal.customerId ?? undefined;

    return this.uow.execute(actor, async (ctx) => {
      // Durable seller-org attribution (pack 01 doc 09): capture the consigning
      // organization NOW from the owner's sole membership, so the attribution
      // survives later membership changes. Ambiguous (multi-org) or unaffiliated
      // owners stay null — we never guess.
      const sellerOrganizationId = ownerCustomerId
        ? await this.resolveSoleOrganization(ctx.tx, ownerCustomerId)
        : undefined;
      const asset = await ctx.tx.asset.create({
        data: {
          id,
          category: input.category,
          schemaVersion: CURRENT_CATEGORY_VERSION,
          attributes: validation.data as unknown as Prisma.InputJsonValue,
          ownerCustomerId,
          sellerOrganizationId,
          lifecycle: 'draft',
        },
      });
      ctx.audit({
        action: 'ASSET_CREATED',
        targetType: 'Asset',
        targetId: id,
        after: { category: input.category },
      });
      return asset;
    });
  }

  async getAsset(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  /**
   * The organization a customer unambiguously belongs to (exactly one active
   * membership), or null. Used to capture durable seller-org attribution at
   * consignment (pack 01 doc 09) without guessing for multi-org members.
   */
  private async resolveSoleOrganization(
    tx: Prisma.TransactionClient,
    customerId: string,
  ): Promise<string | undefined> {
    const memberships = await tx.organizationMember.findMany({
      where: { customerId },
      select: { organizationId: true },
      take: 2,
    });
    return memberships.length === 1 ? memberships[0]!.organizationId : undefined;
  }

  async updateAttributes(principal: Principal, id: string, input: UpdateAssetAttributesInput) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found');

    const canManageAny = principal.permissions.has(Permission.AssetManage);
    if (!canManageAny && asset.ownerCustomerId !== principal.customerId) {
      throw new ForbiddenException('Not permitted to modify this asset');
    }

    const category = isCategoryKey(asset.category) ? asset.category : 'general';
    const validation = validateAssetAttributes(category, input.attributes);
    if (!validation.success) throw new BadRequestException(validation.errors);

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.asset.update({
        where: { id },
        data: { attributes: validation.data as unknown as Prisma.InputJsonValue },
      });
      ctx.audit({
        action: 'ASSET_ATTRIBUTES_UPDATED',
        targetType: 'Asset',
        targetId: id,
        before: asset.attributes ?? undefined,
        after: validation.data,
      });
      return updated;
    });
  }
}
