import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AwardProcurementInput,
  type CreateProcurementRequestInput,
  type SubmitProcurementProposalInput,
  newId,
} from '@singha/contracts';
import {
  type ProcurementProposalView,
  assertProcurementTransition,
  comparableHeadlineMinor,
  procurementParticipation,
  rankProcurementProposals,
  selectProcurementWinner,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

/**
 * Procurement / two-sided-market service (Evolution E9, pack doc 09). Buyers post RFQ /
 * Request-Supply / reverse-tender requests; suppliers submit commercial proposals; the buyer awards
 * ONE explicitly. The non-negotiable: an award is never automatic — matching ranks/recommends
 * (cheapest first), but the buyer selects (pack §09; consistent with D4). Flag-gated by
 * `procurement`.
 */
@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly config: AppConfigService,
  ) {}

  private requireFeature(): void {
    if (!this.config.get().features.procurement) {
      throw new NotFoundException('Procurement is not enabled');
    }
  }

  private customer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  /** A buyer posts a procurement request. */
  async createRequest(principal: Principal, input: CreateProcurementRequestInput) {
    this.requireFeature();
    const buyerId = this.customer(principal);
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const request = await ctx.tx.procurementRequest.create({
        data: {
          id,
          type: input.type,
          status: 'open',
          title: input.title,
          category: input.category,
          specification: input.specification,
          quantity: input.quantity ?? null,
          quantityUnitCode: input.quantityUnitCode,
          destinationCountry: input.destinationCountry,
          deliveryBy: input.deliveryBy ? new Date(input.deliveryBy) : null,
          currency: input.currency,
          paymentTerms: input.paymentTerms,
          operatorCode: input.operatorCode,
          buyerCustomerId: buyerId,
          submissionCloseAt: input.submissionCloseAt ? new Date(input.submissionCloseAt) : null,
        },
      });
      ctx.audit({
        action: 'PROCUREMENT_REQUEST_CREATED',
        targetType: 'ProcurementRequest',
        targetId: id,
      });
      return { id: request.id, type: request.type, status: request.status, title: request.title };
    });
  }

  /** A supplier submits a proposal to an open request (within its submission window). */
  async submitProposal(
    principal: Principal,
    requestId: string,
    input: SubmitProcurementProposalInput,
  ) {
    this.requireFeature();
    const supplierId = this.customer(principal);
    const request = await this.prisma.procurementRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Procurement request not found');
    if (request.status !== 'open') throw new ConflictException('Request is not open for proposals');
    if (request.submissionCloseAt && request.submissionCloseAt <= new Date()) {
      throw new ConflictException('Submission window has closed');
    }
    const p = input.proposal;
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const proposal = await ctx.tx.procurementProposal.create({
        data: {
          id,
          requestId,
          supplierCustomerId: supplierId,
          status: 'open',
          totalPriceMinor: p.totalPriceMinor != null ? BigInt(p.totalPriceMinor) : null,
          unitPriceMinor: p.unitPriceMinor != null ? BigInt(p.unitPriceMinor) : null,
          currency: p.currency,
          quantity: p.quantity ?? null,
          quantityUnitCode: p.quantityUnitCode,
          incoterm: p.incoterm,
          deliveryDate: p.deliveryDate ? new Date(p.deliveryDate) : null,
          paymentTerms: p.paymentTerms,
          validUntil: p.validUntil ? new Date(p.validUntil) : null,
          notes: input.notes,
        },
      });
      ctx.audit({
        action: 'PROCUREMENT_PROPOSAL_SUBMITTED',
        targetType: 'ProcurementProposal',
        targetId: id,
      });
      return { id: proposal.id, requestId, status: proposal.status };
    });
  }

  /** The buyer closes the submission window (open → closed) so the request can be awarded. */
  async closeRequest(principal: Principal, requestId: string) {
    this.requireFeature();
    const request = await this.requireOwnedRequest(principal, requestId);
    assertProcurementTransition(request.status as never, 'closed');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.procurementRequest.update({
        where: { id: requestId },
        data: { status: 'closed' },
      });
      ctx.audit({
        action: 'PROCUREMENT_REQUEST_CLOSED',
        targetType: 'ProcurementRequest',
        targetId: requestId,
      });
      return { id: updated.id, status: updated.status };
    });
  }

  /**
   * The buyer awards ONE explicitly chosen proposal — never automatic (§09 / D4). Marks the winner
   * accepted and the rest rejected, atomically.
   */
  async award(principal: Principal, requestId: string, input: AwardProcurementInput) {
    this.requireFeature();
    const request = await this.requireOwnedRequest(principal, requestId);
    const proposals = await this.prisma.procurementProposal.findMany({ where: { requestId } });
    const winner = selectProcurementWinner(
      proposals.map((p) => this.view(p)),
      {
        closed: request.status === 'closed',
        explicitSelectionId: input.selectedProposalId,
      },
    );
    assertProcurementTransition(request.status as never, 'awarded');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.procurementProposal.update({
        where: { id: winner.id },
        data: { status: 'accepted' },
      });
      await ctx.tx.procurementProposal.updateMany({
        where: { requestId, id: { not: winner.id }, status: { in: ['open'] } },
        data: { status: 'rejected' },
      });
      await ctx.tx.procurementRequest.update({
        where: { id: requestId },
        data: { status: 'awarded', awardedProposalId: winner.id },
      });
      ctx.audit({
        action: 'PROCUREMENT_AWARDED',
        targetType: 'ProcurementRequest',
        targetId: requestId,
        after: { awardedProposalId: winner.id },
      });
      return { requestId, awardedProposalId: winner.id, status: 'awarded' as const };
    });
  }

  /** Ranked proposals for a request (buyer/owner view) — cheapest-first recommendation + counts. */
  async proposalsForRequest(principal: Principal, requestId: string) {
    this.requireFeature();
    const request = await this.requireOwnedRequest(principal, requestId);
    const proposals = await this.prisma.procurementProposal.findMany({ where: { requestId } });
    const views = proposals.map((p) => this.view(p));
    const ranked = rankProcurementProposals(views);
    const byId = new Map(proposals.map((p) => [p.id, p]));
    return {
      requestId,
      status: request.status,
      ...procurementParticipation(views),
      ranked: ranked.map((v, i) => {
        const row = byId.get(v.id);
        return {
          rank: i + 1,
          proposalId: v.id,
          supplierCustomerId: row?.supplierCustomerId ?? null,
          totalPriceMinor: v.totalPriceMinor != null ? Number(v.totalPriceMinor) : null,
          currency: row?.currency,
          incoterm: row?.incoterm ?? null,
        };
      }),
    };
  }

  /** The caller's own procurement requests. */
  async myRequests(principal: Principal) {
    this.requireFeature();
    const rows = await this.prisma.procurementRequest.findMany({
      where: { buyerCustomerId: this.customer(principal) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ id: r.id, type: r.type, status: r.status, title: r.title }));
  }

  private async requireOwnedRequest(principal: Principal, requestId: string) {
    const request = await this.prisma.procurementRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Procurement request not found');
    if (request.buyerCustomerId !== principal.customerId) {
      throw new ForbiddenException('Only the requesting buyer can manage this request');
    }
    return request;
  }

  private view(p: {
    id: string;
    status: string;
    totalPriceMinor: bigint | null;
    unitPriceMinor: bigint | null;
    quantity: { toString(): string } | null;
  }): ProcurementProposalView {
    const headline = comparableHeadlineMinor({
      totalPriceMinor: p.totalPriceMinor,
      unitPriceMinor: p.unitPriceMinor,
      quantity: p.quantity != null ? p.quantity.toString() : null,
    });
    return { id: p.id, totalPriceMinor: headline, status: p.status };
  }
}
