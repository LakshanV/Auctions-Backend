import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AttachPerishableInput,
  type CreateSupplyProgrammeInput,
  Permission,
  type RecommendSupplyInput,
  type SetSupplyProgrammeStatusInput,
  newId,
} from '@singha/contracts';
import {
  type PerishableView,
  type SupplyProgrammeStatus,
  type SupplyProgrammeView,
  assertOrderQuantities,
  assertPerishableConsistent,
  assertSupplyProgrammeTransition,
  isPerishableExpired,
  perishableExpiresAt,
  recommendProgrammes,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

/**
 * Supply Programmes + perishable-goods service (Evolution E10, pack doc 09 §Supply Programme + owner
 * reqs 23/24). A commodity supplier posts standing availability once; buyers query for matching
 * programmes. Matching is a **recommendation only** — it awards nothing (pack §09; consistent with
 * D4). Perishable metadata (agricultural/food) attaches additively to a programme or listing and
 * drives automatic expiry. Flag-gated by `supplyProgrammes` / `perishableGoods`.
 */
@Injectable()
export class SupplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly config: AppConfigService,
  ) {}

  private requireSupply(): void {
    if (!this.config.get().features.supplyProgrammes) {
      throw new NotFoundException('Supply programmes are not enabled');
    }
  }

  private requirePerishable(): void {
    if (!this.config.get().features.perishableGoods) {
      throw new NotFoundException('Perishable goods metadata is not enabled');
    }
  }

  private customer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  /** A supplier posts a recurring supply programme (draft). */
  async createProgramme(principal: Principal, input: CreateSupplyProgrammeInput) {
    this.requireSupply();
    const supplierId = this.customer(principal);
    assertOrderQuantities(input.minOrderQuantity ?? null, input.maxOrderQuantity ?? null);
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const row = await ctx.tx.supplyProgramme.create({
        data: {
          id,
          supplierCustomerId: supplierId,
          product: input.product,
          category: input.category,
          originCountry: input.originCountry,
          availableQuantity: input.availableQuantity ?? null,
          quantityUnitCode: input.quantityUnitCode,
          frequency: input.frequency,
          minOrderQuantity: input.minOrderQuantity ?? null,
          maxOrderQuantity: input.maxOrderQuantity ?? null,
          pricingBasis: input.pricingBasis,
          indicativePriceMinor:
            input.indicativePriceMinor != null ? BigInt(input.indicativePriceMinor) : null,
          currency: input.currency,
          packing: input.packing,
          quality: input.quality,
          incoterm: input.incoterm,
          validFrom: input.validFrom ? new Date(input.validFrom) : null,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          leadTimeDays: input.leadTimeDays,
          operatorCode: input.operatorCode,
          status: 'draft',
        },
      });
      ctx.audit({
        action: 'SUPPLY_PROGRAMME_CREATED',
        targetType: 'SupplyProgramme',
        targetId: id,
      });
      return { id: row.id, product: row.product, status: row.status };
    });
  }

  /** Move a programme through its lifecycle (owner-only, transition-validated). */
  async setStatus(principal: Principal, id: string, input: SetSupplyProgrammeStatusInput) {
    this.requireSupply();
    const programme = await this.requireOwnedProgramme(principal, id);
    assertSupplyProgrammeTransition(
      programme.status as SupplyProgrammeStatus,
      input.status as SupplyProgrammeStatus,
    );
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const row = await ctx.tx.supplyProgramme.update({
        where: { id },
        data: { status: input.status },
      });
      ctx.audit({
        action: 'SUPPLY_PROGRAMME_STATUS',
        targetType: 'SupplyProgramme',
        targetId: id,
        after: { status: row.status },
      });
      return { id: row.id, status: row.status };
    });
  }

  /** The caller's own programmes. */
  async myProgrammes(principal: Principal) {
    this.requireSupply();
    const rows = await this.prisma.supplyProgramme.findMany({
      where: { supplierCustomerId: this.customer(principal) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      product: r.product,
      category: r.category,
      status: r.status,
    }));
  }

  /** A single owned programme. */
  async getProgramme(principal: Principal, id: string) {
    this.requireSupply();
    const row = await this.requireOwnedProgramme(principal, id);
    return {
      id: row.id,
      product: row.product,
      category: row.category,
      originCountry: row.originCountry,
      availableQuantity: row.availableQuantity?.toString() ?? null,
      minOrderQuantity: row.minOrderQuantity?.toString() ?? null,
      maxOrderQuantity: row.maxOrderQuantity?.toString() ?? null,
      quantityUnitCode: row.quantityUnitCode,
      indicativePriceMinor:
        row.indicativePriceMinor != null ? Number(row.indicativePriceMinor) : null,
      currency: row.currency,
      frequency: row.frequency,
      leadTimeDays: row.leadTimeDays,
      status: row.status,
    };
  }

  /**
   * Buyer-side matching: offerable programmes that could satisfy the demand, ranked cheapest-first.
   * Advisory ONLY — this creates nothing and binds nothing (pack §09 / D4).
   */
  async recommend(principal: Principal, input: RecommendSupplyInput) {
    this.requireSupply();
    this.customer(principal);
    const rows = await this.prisma.supplyProgramme.findMany({ where: { status: 'active' } });
    const views = rows.map((r) => this.toProgrammeView(r));
    const recommendations = recommendProgrammes(
      views,
      {
        category: input.category,
        product: input.product,
        quantityRequired: input.quantityRequired,
        quantityUnitCode: input.quantityUnitCode,
        originCountry: input.originCountry,
      },
      new Date(),
    );
    return {
      binding: false as const,
      count: recommendations.length,
      recommendations: recommendations.map((r) => ({
        programmeId: r.programmeId,
        product: r.product,
        originCountry: r.originCountry,
        indicativePriceMinor:
          r.indicativePriceMinor != null ? Number(r.indicativePriceMinor) : null,
        leadTimeDays: r.leadTimeDays,
      })),
    };
  }

  /** Attach (upsert) perishable metadata to a subject the caller is authorised for. */
  async attachPerishable(principal: Principal, input: AttachPerishableInput) {
    this.requirePerishable();
    await this.assertPerishableSubjectAuthorised(principal, input.subjectType, input.subjectId);
    const m = input.metadata;
    // Validate descriptive invariants (throws InvariantViolation → 422).
    assertPerishableConsistent(this.toPerishableView(m));
    const actor = toActor(principal);
    const id = newId();
    const data = {
      harvestDate: m.harvestDate ? new Date(m.harvestDate) : null,
      packingDate: m.packingDate ? new Date(m.packingDate) : null,
      expiryDate: m.expiryDate ? new Date(m.expiryDate) : null,
      variety: m.variety ?? null,
      grade: m.grade ?? null,
      size: m.size ?? null,
      moisturePercent: m.moisturePercent ?? null,
      qualitySpec: m.qualitySpec ?? null,
      coldChain: m.coldChain ?? false,
      tempMinC: m.tempMinC ?? null,
      tempMaxC: m.tempMaxC ?? null,
      phytosanitaryCert: m.phytosanitaryCert ?? false,
      originCert: m.originCert ?? false,
      availableQuantity: m.availableQuantity ?? null,
      minQuantity: m.minQuantity ?? null,
      shipmentWindowStart: m.shipmentWindowStart ? new Date(m.shipmentWindowStart) : null,
      shipmentWindowEnd: m.shipmentWindowEnd ? new Date(m.shipmentWindowEnd) : null,
    };
    return this.uow.execute(actor, async (ctx) => {
      const row = await ctx.tx.perishableMetadata.upsert({
        where: {
          subjectType_subjectId: {
            subjectType: input.subjectType,
            subjectId: input.subjectId,
          },
        },
        create: { id, subjectType: input.subjectType, subjectId: input.subjectId, ...data },
        update: data,
      });
      ctx.audit({
        action: 'PERISHABLE_METADATA_ATTACHED',
        targetType: 'PerishableMetadata',
        targetId: row.id,
      });
      return { id: row.id, subjectType: row.subjectType, subjectId: row.subjectId };
    });
  }

  /** Read perishable metadata + its automatic-expiry status. */
  async getPerishable(principal: Principal, subjectType: string, subjectId: string) {
    this.requirePerishable();
    this.customer(principal);
    const row = await this.prisma.perishableMetadata.findUnique({
      where: { subjectType_subjectId: { subjectType, subjectId } },
    });
    if (!row) throw new NotFoundException('Perishable metadata not found');
    const view = this.toPerishableView({
      harvestDate: row.harvestDate?.toISOString(),
      packingDate: row.packingDate?.toISOString(),
      expiryDate: row.expiryDate?.toISOString(),
      moisturePercent: row.moisturePercent?.toString(),
      tempMinC: row.tempMinC?.toString(),
      tempMaxC: row.tempMaxC?.toString(),
      shipmentWindowStart: row.shipmentWindowStart?.toISOString(),
      shipmentWindowEnd: row.shipmentWindowEnd?.toISOString(),
    });
    const at = perishableExpiresAt(view);
    return {
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      variety: row.variety,
      grade: row.grade,
      coldChain: row.coldChain,
      expiresAt: at ? at.toISOString() : null,
      expired: isPerishableExpired(view, new Date()),
    };
  }

  private async requireOwnedProgramme(principal: Principal, id: string) {
    const row = await this.prisma.supplyProgramme.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Supply programme not found');
    if (row.supplierCustomerId !== principal.customerId) {
      throw new ForbiddenException('Only the owning supplier can manage this programme');
    }
    return row;
  }

  /** Authorise a perishable attach: programme subjects are owner-gated; listing subjects require the
   *  listing to exist and the caller to hold operator/seller authority (`exchange:operate`). */
  private async assertPerishableSubjectAuthorised(
    principal: Principal,
    subjectType: string,
    subjectId: string,
  ): Promise<void> {
    if (subjectType === 'supply_programme') {
      await this.requireOwnedProgramme(principal, subjectId);
      return;
    }
    // subjectType === 'listing'
    const listing = await this.prisma.listing.findUnique({ where: { id: subjectId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (!principal.permissions.has(Permission.ExchangeOperate)) {
      throw new ForbiddenException('Attaching metadata to a listing requires operator authority');
    }
  }

  private toProgrammeView(r: {
    id: string;
    status: string;
    product: string;
    category: string | null;
    originCountry: string | null;
    availableQuantity: { toString(): string } | null;
    minOrderQuantity: { toString(): string } | null;
    maxOrderQuantity: { toString(): string } | null;
    quantityUnitCode: string | null;
    indicativePriceMinor: bigint | null;
    leadTimeDays: number | null;
    validFrom: Date | null;
    validUntil: Date | null;
  }): SupplyProgrammeView {
    return {
      id: r.id,
      status: r.status,
      product: r.product,
      category: r.category,
      originCountry: r.originCountry,
      availableQuantity: r.availableQuantity?.toString() ?? null,
      minOrderQuantity: r.minOrderQuantity?.toString() ?? null,
      maxOrderQuantity: r.maxOrderQuantity?.toString() ?? null,
      quantityUnitCode: r.quantityUnitCode,
      indicativePriceMinor: r.indicativePriceMinor,
      leadTimeDays: r.leadTimeDays,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
    };
  }

  private toPerishableView(m: {
    harvestDate?: string;
    packingDate?: string;
    expiryDate?: string;
    moisturePercent?: string | null;
    tempMinC?: string | null;
    tempMaxC?: string | null;
    shipmentWindowStart?: string;
    shipmentWindowEnd?: string;
  }): PerishableView {
    return {
      harvestDate: m.harvestDate ? new Date(m.harvestDate) : null,
      packingDate: m.packingDate ? new Date(m.packingDate) : null,
      expiryDate: m.expiryDate ? new Date(m.expiryDate) : null,
      moisturePercent: m.moisturePercent ?? null,
      tempMinC: m.tempMinC ?? null,
      tempMaxC: m.tempMaxC ?? null,
      shipmentWindowStart: m.shipmentWindowStart ? new Date(m.shipmentWindowStart) : null,
      shipmentWindowEnd: m.shipmentWindowEnd ? new Date(m.shipmentWindowEnd) : null,
    };
  }
}
