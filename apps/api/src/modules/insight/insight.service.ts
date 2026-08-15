import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CompareProposalsInput,
  type MatchCriteriaInput,
  type PriceComparablesInput,
  type RiskSignalsInput,
  newId,
} from '@singha/contracts';
import {
  type MatchCandidate,
  assessRisk,
  compareProposals,
  priceComparables,
  rankMatches,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { type Principal } from '../../shared/auth/principal';

const toNum = (v: bigint | null) => (v != null ? Number(v) : null);

/**
 * Singha Intelligence service (Evolution E12, pack doc 12 §AI). Deterministic matching / offer /
 * pricing / risk intelligence. Every response is a **derived, non-binding recommendation** and is
 * persisted as an append-only `IntelligenceReport` snapshot — it never overwrites a fact and never
 * binds a transaction (rule 3 / rule 11 / doc 12). No LLM is involved. Flag-gated by `insightEngine`.
 */
@Injectable()
export class InsightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private requireFeature(): void {
    if (!this.config.get().features.insightEngine) {
      throw new NotFoundException('Intelligence expansion is not enabled');
    }
  }

  private customer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  private async persist(
    kind: string,
    requestedBy: string | null,
    subjectRef: string | null,
    result: unknown,
  ) {
    await this.prisma.intelligenceReport.create({
      data: {
        id: newId(),
        kind,
        requestedByCustomerId: requestedBy,
        subjectRef,
        result: result as object,
      },
    });
  }

  /** Buyer↔supply matching over offerable programmes (advisory, scored + explainable). */
  async match(principal: Principal, input: MatchCriteriaInput) {
    this.requireFeature();
    const requestedBy = principal.customerId ?? null;
    const rows = await this.prisma.supplyProgramme.findMany({ where: { status: 'active' } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const candidates: MatchCandidate[] = rows.map((r) => ({
      id: r.id,
      category: r.category,
      product: r.product,
      originCountry: r.originCountry,
      availableQuantity: r.availableQuantity?.toString() ?? null,
      minOrderQuantity: r.minOrderQuantity?.toString() ?? null,
      quantityUnitCode: r.quantityUnitCode,
      indicativePriceMinor: r.indicativePriceMinor,
    }));
    const matches = rankMatches(input, candidates).map((m) => {
      const row = byId.get(m.candidateId);
      return {
        programmeId: m.candidateId,
        product: row?.product ?? null,
        originCountry: row?.originCountry ?? null,
        score: m.score,
        factors: m.factors,
        indicativePriceMinor: toNum(m.indicativePriceMinor),
      };
    });
    const result = {
      binding: false as const,
      kind: 'MATCH' as const,
      count: matches.length,
      matches,
    };
    await this.persist('MATCH', requestedBy, null, result);
    return result;
  }

  /** Compare complete proposals (Offer Intelligence) — advisory ranking, never a selection. */
  async compareOffers(principal: Principal, input: CompareProposalsInput) {
    this.requireFeature();
    const requestedBy = principal.customerId ?? null;
    const cmp = compareProposals(
      input.proposals.map((p) => ({
        id: p.id,
        totalPriceMinor: p.totalPriceMinor != null ? BigInt(p.totalPriceMinor) : null,
        unitPriceMinor: p.unitPriceMinor != null ? BigInt(p.unitPriceMinor) : null,
        quantity: p.quantity ?? null,
        deliveryDays: p.deliveryDays ?? null,
        incoterm: p.incoterm ?? null,
      })),
    );
    const result = {
      binding: false as const,
      kind: 'OFFER_COMPARISON' as const,
      ranked: cmp.ranked.map((r) => ({
        id: r.id,
        headlineMinor: toNum(r.headlineMinor),
        deliveryDays: r.deliveryDays,
        incoterm: r.incoterm,
      })),
      cheapestId: cmp.cheapestId,
      fastestId: cmp.fastestId,
    };
    await this.persist('OFFER_COMPARISON', requestedBy, null, result);
    return result;
  }

  /** Pricing comparables over observed programme prices for a category/product. */
  async pricing(principal: Principal, input: PriceComparablesInput) {
    this.requireFeature();
    const requestedBy = principal.customerId ?? null;
    const rows = await this.prisma.supplyProgramme.findMany({
      where: {
        status: 'active',
        indicativePriceMinor: { not: null },
        ...(input.category ? { category: input.category } : {}),
        ...(input.product ? { product: { contains: input.product, mode: 'insensitive' } } : {}),
      },
      select: { indicativePriceMinor: true },
    });
    const prices = rows.map((r) => r.indicativePriceMinor).filter((v): v is bigint => v != null);
    const c = priceComparables(prices);
    const result = {
      binding: false as const,
      kind: 'PRICE_COMPARABLES' as const,
      count: c.count,
      minMinor: toNum(c.minMinor),
      medianMinor: toNum(c.medianMinor),
      maxMinor: toNum(c.maxMinor),
      spreadMinor: toNum(c.spreadMinor),
    };
    await this.persist('PRICE_COMPARABLES', requestedBy, null, result);
    return result;
  }

  /** Deterministic fraud/risk review signal (operator tool) — never an automatic block. */
  async risk(principal: Principal, input: RiskSignalsInput) {
    this.requireFeature();
    this.customer(principal);
    const assessment = assessRisk(input);
    const result = { binding: false as const, kind: 'RISK' as const, ...assessment };
    await this.persist('RISK', principal.customerId ?? null, null, result);
    return result;
  }
}
