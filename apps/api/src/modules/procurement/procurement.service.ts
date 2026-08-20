import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AwardProcurementInput,
  type CreateProcurementRequestInput,
  type ProcurementRequestsQuery,
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
import {
  buyerScopeFilter,
  isActingForOrganization,
  resolveActorContext,
} from '../../shared/auth/actor-context';
import { type Principal } from '../../shared/auth/principal';

/**
 * Procurement / two-sided-market service (Evolution E9, pack doc 09). Buyers post RFQ /
 * Request-Supply / reverse-tender requests; suppliers submit commercial proposals; the buyer awards
 * ONE explicitly. The non-negotiable: an award is never automatic — matching ranks/recommends
 * (cheapest first), but the buyer selects (pack §09; consistent with D4). Flag-gated by
 * `procurement`.
 *
 * A request belongs to exactly ONE book of record: a member's personal book, or an organization's.
 * The book is chosen by the caller's EXPLICIT acting context at creation and stamped durably onto
 * the row (`buyerOrganizationId`); it is never inferred from the poster's memberships. Every read
 * and every management action then re-derives the book from the record, so a personal request can
 * never be reached from an organization context, and one organization's requests can never be
 * reached from another's (shared rules in `shared/auth/actor-context.ts`).
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

  /**
   * A buyer posts a procurement request, in one explicit acting context.
   *
   * `context: 'organization'` is authorized BEFORE the row is written (real membership of that
   * organization, or the `organization:manage` grant) and stamps `buyerOrganizationId` durably, so
   * the request stays in the organization's book even if this employee later leaves. The default
   * personal context can never produce an organization attribution.
   */
  async createRequest(principal: Principal, input: CreateProcurementRequestInput) {
    this.requireFeature();
    const buyerId = this.customer(principal);
    const context = await resolveActorContext(this.prisma, principal, input);
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
          buyerOrganizationId: context.organizationId,
          submissionCloseAt: input.submissionCloseAt ? new Date(input.submissionCloseAt) : null,
        },
      });
      ctx.audit({
        action: 'PROCUREMENT_REQUEST_CREATED',
        targetType: 'ProcurementRequest',
        targetId: id,
        after: { context: context.kind, buyerOrganizationId: context.organizationId },
      });
      return {
        id: request.id,
        type: request.type,
        status: request.status,
        title: request.title,
        context: context.kind,
        buyerOrganizationId: request.buyerOrganizationId,
      };
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

  /**
   * The requests in ONE book: the caller's personal requests (never organization-attributed ones),
   * or a named organization's requests (never the caller's personal ones, and never another
   * organization's). The two lists are disjoint by construction — see `buyerScopeFilter`.
   */
  async myRequests(
    principal: Principal,
    query: ProcurementRequestsQuery = { context: 'personal' },
  ) {
    this.requireFeature();
    const context = await resolveActorContext(this.prisma, principal, query);
    const rows = await this.prisma.procurementRequest.findMany({
      where: buyerScopeFilter(context),
      orderBy: { createdAt: 'desc' },
    });
    return {
      context: {
        kind: context.kind,
        organizationId: context.organizationId,
        role: context.role,
        viaStaffPermission: context.viaStaffPermission,
      },
      requests: rows.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        title: r.title,
        buyerOrganizationId: r.buyerOrganizationId,
      })),
    };
  }

  /**
   * Authorize a management action (close / award / read proposals) against the book the RECORD
   * belongs to, not the book the caller asked for.
   *
   * - An organization-attributed request is manageable by any member of THAT organization (or
   *   `organization:manage` staff) — including a colleague, so the request is not stranded when
   *   the employee who posted it leaves. Membership of a different organization is never enough.
   * - A personal request is manageable only by the individual who owns it. No organization context
   *   can reach it, so a personal request can never be pulled into an organization's book.
   */
  private async requireOwnedRequest(principal: Principal, requestId: string) {
    const request = await this.prisma.procurementRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Procurement request not found');
    if (request.buyerOrganizationId) {
      const permitted = await isActingForOrganization(
        this.prisma,
        principal,
        request.buyerOrganizationId,
      );
      if (!permitted) {
        throw new ForbiddenException('Only the requesting organization can manage this request');
      }
      return request;
    }
    if (!principal.customerId || request.buyerCustomerId !== principal.customerId) {
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
