import { Injectable, NotFoundException } from '@nestjs/common';
import { type ComputeChargesRequest, newId } from '@singha/contracts';
import {
  type ChargeLineValue,
  type ChargesResultValue,
  type ConfigVerification,
  type FeeRuleView,
  computeCharges,
} from '@singha/domain';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';

/**
 * Fees / Tax rules-engine service (Evolution E8, pack doc 10). Loads the versioned `FeeRule` config
 * and delegates to the pure `@singha/domain` engine, then persists the computed breakdown (with the
 * per-line applied rules) as a `FeeBreakdown` snapshot so an old transaction stays reproducible
 * after rules change. Tax rule values are owner-gated (O3): an unverified applied rule yields a
 * non-binding `MANUAL_REVIEW_REQUIRED` preview (D7). Flag-gated by `feesEngine`.
 */
@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private requireFeature(): void {
    if (!this.config.get().features.feesEngine) {
      throw new NotFoundException('Fees engine is not enabled');
    }
  }

  /** Compute + persist a charge breakdown for a transaction shape. */
  async compute(input: ComputeChargesRequest) {
    this.requireFeature();
    const rules = await this.prisma.feeRule.findMany({ where: { active: true } });
    const result = computeCharges(
      {
        principalMinor: BigInt(input.principalMinor),
        operatorCode: input.operatorCode,
        jurisdiction: input.jurisdiction,
        category: input.category,
        saleMethodCode: input.saleMethodCode,
      },
      rules.map((r) => this.toRuleView(r)),
    );

    const lines = result.lines.map((l) => this.lineView(l));
    const breakdownId = newId();
    await this.prisma.feeBreakdown.create({
      data: {
        id: breakdownId,
        status: result.status,
        currency: input.currency,
        principalMinor: result.principalMinor,
        buyerFeesMinor: result.buyerFeesMinor,
        taxMinor: result.taxMinor,
        buyerTotalMinor: result.buyerTotalMinor,
        sellerCommissionMinor: result.sellerCommissionMinor,
        sellerProceedsMinor: result.sellerProceedsMinor,
        lines: lines as unknown as Prisma.InputJsonValue,
        input: input as unknown as Prisma.InputJsonValue,
      },
    });
    return { breakdownId, ...this.view(result, input.currency, lines) };
  }

  private view(
    result: ChargesResultValue,
    currency: string,
    lines: ReturnType<FeesService['lineView']>[],
  ) {
    return {
      status: result.status,
      currency,
      principalMinor: Number(result.principalMinor),
      lines,
      buyerFeesMinor: Number(result.buyerFeesMinor),
      taxMinor: Number(result.taxMinor),
      buyerTotalMinor: Number(result.buyerTotalMinor),
      sellerCommissionMinor: Number(result.sellerCommissionMinor),
      sellerProceedsMinor: Number(result.sellerProceedsMinor),
      reason: result.reason,
    };
  }

  private lineView(l: ChargeLineValue) {
    return {
      component: l.component,
      side: l.side,
      basis: l.basis,
      amountMinor: Number(l.amountMinor),
      appliedRuleCode: l.appliedRuleCode,
      appliedRuleVersion: l.appliedRuleVersion,
      rateBps: l.rateBps,
      fixedMinor: l.fixedMinor == null ? null : Number(l.fixedMinor),
    };
  }

  private toRuleView(r: {
    code: string;
    version: number;
    priority: number;
    component: string;
    side: string;
    basis: string;
    rateBps: number | null;
    fixedMinor: bigint | null;
    appliesTo: string;
    operatorCode: string | null;
    jurisdiction: string | null;
    category: string | null;
    saleMethodCode: string | null;
    minPrincipalMinor: bigint | null;
    maxPrincipalMinor: bigint | null;
    verification: string;
  }): FeeRuleView {
    return {
      code: r.code,
      version: r.version,
      priority: r.priority,
      component: r.component as FeeRuleView['component'],
      side: r.side as FeeRuleView['side'],
      basis: r.basis as FeeRuleView['basis'],
      rateBps: r.rateBps,
      fixedMinor: r.fixedMinor,
      appliesTo: r.appliesTo as FeeRuleView['appliesTo'],
      operatorCode: r.operatorCode,
      jurisdiction: r.jurisdiction,
      category: r.category,
      saleMethodCode: r.saleMethodCode,
      minPrincipalMinor: r.minPrincipalMinor,
      maxPrincipalMinor: r.maxPrincipalMinor,
      verification: r.verification as ConfigVerification,
    };
  }
}
