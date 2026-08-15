import { Injectable, NotFoundException } from '@nestjs/common';
import { type RoutingInput, newId } from '@singha/contracts';
import {
  type ConfigVerification,
  type RoutingRuleView,
  type TermsDocumentView,
  resolveRouting,
  resolveTerms,
} from '@singha/domain';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';

/**
 * Transaction Routing + two-layer Terms service (Evolution E6, pack doc 07). Loads the configured
 * `RoutingRule` / `TermsDocument` rows and delegates to the pure, deterministic engine
 * (`@singha/domain`). Every resolution is persisted as an explainable `RoutingDecision` snapshot
 * (Addendum A). Binding routes require owner-verified config; anything else resolves as a
 * non-binding `MANUAL_REVIEW_REQUIRED` preview (DECISIONS D7). Flag-gated by `transactionRouting`.
 */
@Injectable()
export class RoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private requireFeature(): void {
    if (!this.config.get().features.transactionRouting) {
      throw new NotFoundException('Transaction routing is not enabled');
    }
  }

  /** Resolve the routing for a transaction shape and persist the decision snapshot. */
  async resolve(input: RoutingInput) {
    this.requireFeature();
    const rules = await this.prisma.routingRule.findMany({ where: { active: true } });
    const resolution = resolveRouting(
      input,
      rules.map((r) => this.toRuleView(r)),
    );

    const decisionId = newId();
    await this.prisma.routingDecision.create({
      data: {
        id: decisionId,
        status: resolution.status,
        saleMethodCode: input.saleMethodCode,
        matchedRuleCode: resolution.matchedRuleCode,
        matchedRuleVersion: resolution.matchedRuleVersion,
        transactionOperatorCode: resolution.transactionOperatorCode,
        paymentRouteCode: resolution.paymentRouteCode,
        termsCode: resolution.termsCode,
        reason: resolution.reason,
        input: input as unknown as Prisma.InputJsonValue,
      },
    });
    return { ...resolution, decisionId };
  }

  /** Resolve the two-layer terms (platform + most-specific transaction) for a transaction shape. */
  async terms(input: RoutingInput) {
    this.requireFeature();
    const docs = await this.prisma.termsDocument.findMany({ where: { active: true } });
    return resolveTerms(
      input,
      docs.map((d) => this.toDocView(d)),
    );
  }

  private toRuleView(r: {
    code: string;
    version: number;
    priority: number;
    saleMethodCode: string | null;
    category: string | null;
    marketCode: string | null;
    jurisdiction: string | null;
    operatorCode: string | null;
    originNodeCode: string | null;
    destinationCountry: string | null;
    transactionOperatorCode: string | null;
    paymentRouteCode: string | null;
    termsCode: string | null;
    disclosure: string | null;
    requiresKyc: boolean;
    requiresLicence: boolean;
    verification: string;
  }): RoutingRuleView {
    return { ...r, verification: r.verification as ConfigVerification };
  }

  private toDocView(d: {
    code: string;
    version: number;
    layer: string;
    operatorCode: string | null;
    jurisdiction: string | null;
    category: string | null;
    saleMethodCode: string | null;
    bodyRef: string | null;
    verification: string;
    active: boolean;
  }): TermsDocumentView {
    return {
      ...d,
      layer: d.layer === 'PLATFORM' ? 'PLATFORM' : 'TRANSACTION',
      verification: d.verification as ConfigVerification,
    };
  }
}
