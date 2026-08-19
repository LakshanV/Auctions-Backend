import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ApproveCreditInput,
  type CreateMemberFlagInput,
  DomainEventName,
  type GrantTemporaryMembershipInput,
  Permission,
  type RecordPerformanceEventInput,
  type ReleaseSecurityInstrumentInput,
  type ResolveMemberFlagInput,
  type SetMembershipStatusInput,
  type SubmitSecurityInstrumentInput,
  type SuspendCreditInput,
  type VerifySecurityInstrumentInput,
  newId,
} from '@singha/contracts';
import {
  FULL_FACTOR_BPS,
  calculatedBaseLimitMinor,
  computePerformanceSnapshot,
  rulesetForContext,
  totalEligibleSecurityMinor,
} from '@singha/domain';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork, type UowContext } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { CreditExposureService } from './credit-exposure.service';
import { CrmCustomerService } from '../crm/crm-customer.service';

/**
 * Member identity, credit, security & performance engine (Revision 05). Binding
 * decisions are deterministic + authorized (AAL2 on sensitive actions, enforced by
 * guards at the controller). AI can summarize but never mutate credit/security/
 * membership/flags. Money is BigInt minor units.
 */
@Injectable()
export class MemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly exposure: CreditExposureService,
    private readonly crmCustomer: CrmCustomerService,
  ) {}

  // ---- Security instruments --------------------------------------------------

  async submitSecurityInstrument(principal: Principal, input: SubmitSecurityInstrumentInput) {
    await this.requireCustomer(input.customerId);
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const inst = await ctx.tx.securityInstrument.create({
        data: {
          id,
          customerId: input.customerId,
          organizationId: input.organizationId,
          type: input.type,
          currency: input.currency,
          faceAmountMinor: BigInt(input.faceAmountMinor),
          eligibilityBps: input.eligibilityBps,
          status: 'pending_verification',
          reference: input.reference,
          issuingBank: input.issuingBank,
          guaranteeNumber: input.guaranteeNumber,
          issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
          documentMediaId: input.documentMediaId,
          notes: input.notes,
        },
      });
      ctx.audit({
        action: 'SECURITY_INSTRUMENT_SUBMITTED',
        targetType: 'SecurityInstrument',
        targetId: id,
        after: { type: input.type, faceAmountMinor: input.faceAmountMinor },
      });
      ctx.emit({
        name: DomainEventName.SecurityInstrumentSubmitted,
        aggregateType: 'SecurityInstrument',
        aggregateId: id,
        payload: { customerId: input.customerId, type: input.type },
      });
      return this.publicInstrument(inst);
    });
  }

  async verifySecurityInstrument(
    principal: Principal,
    id: string,
    input: VerifySecurityInstrumentInput,
  ) {
    const inst = await this.prisma.securityInstrument.findUnique({ where: { id } });
    if (!inst) throw new NotFoundException('Security instrument not found');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      if (input.decision === 'reject') {
        const updated = await ctx.tx.securityInstrument.update({
          where: { id },
          data: { status: 'rejected', eligibleAmountMinor: 0n, notes: input.reason ?? inst.notes },
        });
        ctx.audit({
          action: 'SECURITY_INSTRUMENT_REJECTED',
          targetType: 'SecurityInstrument',
          targetId: id,
          reason: input.reason,
        });
        return this.publicInstrument(updated);
      }
      const bps = input.eligibilityBps ?? inst.eligibilityBps;
      const eligible = (inst.faceAmountMinor * BigInt(bps)) / BigInt(FULL_FACTOR_BPS);
      const updated = await ctx.tx.securityInstrument.update({
        where: { id },
        data: {
          status: 'verified',
          eligibilityBps: bps,
          eligibleAmountMinor: eligible,
          verifiedAt: new Date(),
          verifiedBy: actor.id ?? undefined,
        },
      });
      ctx.audit({
        action: 'SECURITY_INSTRUMENT_VERIFIED',
        targetType: 'SecurityInstrument',
        targetId: id,
        after: { eligibleAmountMinor: Number(eligible) },
      });
      ctx.emit({
        name: DomainEventName.SecurityInstrumentVerified,
        aggregateType: 'SecurityInstrument',
        aggregateId: id,
        payload: { customerId: inst.customerId, eligibleAmountMinor: Number(eligible) },
      });
      return this.publicInstrument(updated);
    });
  }

  async releaseSecurityInstrument(
    principal: Principal,
    id: string,
    input: ReleaseSecurityInstrumentInput,
  ) {
    const inst = await this.prisma.securityInstrument.findUnique({ where: { id } });
    if (!inst) throw new NotFoundException('Security instrument not found');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      // §5/§7-C: a deposit or guarantee cannot leave the system while Singha still
      // relies on it. Lock the customer's facility row (the SAME row the bid gate
      // locks) so a concurrent bid can't slip a reservation between this check and
      // the release — release and a new bid serialize, one loses deterministically.
      // Then block if any ACTIVE or CONVERTED (won-but-unpaid) exposure remains.
      await ctx.tx.$queryRawUnsafe(
        `SELECT id FROM credit_facility WHERE customer_id = $1 AND status = 'active' FOR UPDATE`,
        inst.customerId,
      );
      const committed = await this.exposure.committedExposureMinor(ctx.tx, inst.customerId);
      if (committed > 0n) {
        throw new ConflictException({
          code: 'OUTSTANDING_EXPOSURE',
          message: 'This security supports outstanding exposure and cannot be released.',
        });
      }
      const updated = await ctx.tx.securityInstrument.update({
        where: { id },
        data: {
          status: 'released',
          releasedAt: new Date(),
          releasedBy: actor.id ?? undefined,
          notes: input.reason ?? inst.notes,
        },
      });
      ctx.audit({
        action: 'SECURITY_INSTRUMENT_RELEASED',
        targetType: 'SecurityInstrument',
        targetId: id,
        reason: input.reason,
      });
      ctx.emit({
        name: DomainEventName.SecurityInstrumentReleased,
        aggregateType: 'SecurityInstrument',
        aggregateId: id,
        payload: { customerId: inst.customerId },
      });
      return this.publicInstrument(updated);
    });
  }

  // ---- Credit facility -------------------------------------------------------

  async approveCredit(principal: Principal, input: ApproveCreditInput) {
    await this.requireCustomer(input.customerId);
    const actor = toActor(principal);

    // An approval ABOVE the policy-calculated limit is an override — gate it.
    return this.uow.execute(actor, async (ctx) => {
      const securities = await ctx.tx.securityInstrument.findMany({
        where: { customerId: input.customerId, status: { in: ['verified', 'active'] } },
      });
      const now = new Date();
      const eligible = totalEligibleSecurityMinor(
        securities.map((s) => ({
          faceAmountMinor: s.faceAmountMinor,
          eligibilityBps: s.eligibilityBps,
          countsTowardCredit: !s.expiresAt || s.expiresAt > now,
        })),
      );
      const existing = await ctx.tx.creditFacility.findFirst({
        where: { customerId: input.customerId, scopeType: 'platform' },
        orderBy: { createdAt: 'asc' },
      });
      const requiredBps = input.requiredSecurityBps ?? existing?.requiredSecurityBps ?? 500;
      const calculated = calculatedBaseLimitMinor({
        eligibleSecurityMinor: eligible,
        requiredSecurityBps: requiredBps,
      });
      const approved =
        input.approvedLimitMinor != null ? BigInt(input.approvedLimitMinor) : calculated;
      const isOverride = approved > calculated;
      if (isOverride && !principal.permissions.has(Permission.CreditOverride)) {
        throw new ForbiddenException(
          'Approving above the calculated limit requires credit:override',
        );
      }

      const previous = existing?.approvedLimitMinor ?? null;
      const data = {
        calculatedBaseLimitMinor: calculated,
        approvedLimitMinor: approved,
        temporaryUpliftMinor: input.temporaryUpliftMinor
          ? BigInt(input.temporaryUpliftMinor)
          : (existing?.temporaryUpliftMinor ?? 0n),
        requiredSecurityBps: requiredBps,
        status: 'active' as const,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : existing?.expiresAt,
        approvedBy: actor.id ?? undefined,
        approvalReason: input.reason,
      };
      const facility = existing
        ? await ctx.tx.creditFacility.update({ where: { id: existing.id }, data })
        : await ctx.tx.creditFacility.create({
            data: { id: newId(), customerId: input.customerId, currency: 'LKR', ...data },
          });

      // Link the supporting securities (idempotent join).
      for (const s of securities) {
        await ctx.tx.creditFacilitySecurity.upsert({
          where: {
            facilityId_securityInstrumentId: {
              facilityId: facility.id,
              securityInstrumentId: s.id,
            },
          },
          update: {},
          create: { id: newId(), facilityId: facility.id, securityInstrumentId: s.id },
        });
      }

      // Append-only decision history — prior decisions never overwritten (§15).
      await ctx.tx.creditDecision.create({
        data: {
          id: newId(),
          facilityId: facility.id,
          decisionType: isOverride ? 'override' : 'approve',
          previousLimitMinor: previous,
          newLimitMinor: approved,
          reason: input.reason,
          decidedBy: actor.id ?? undefined,
          secondApprover: input.secondApprover,
          policyVersion: facility.policyVersion,
        },
      });

      ctx.audit({
        action: 'CREDIT_LIMIT_APPROVED',
        targetType: 'CreditFacility',
        targetId: facility.id,
        before: previous == null ? undefined : { approvedLimitMinor: Number(previous) },
        after: { approvedLimitMinor: Number(approved), override: isOverride },
      });
      ctx.emit({
        name:
          previous == null
            ? DomainEventName.CreditLimitApproved
            : DomainEventName.CreditLimitChanged,
        aggregateType: 'CreditFacility',
        aggregateId: facility.id,
        payload: {
          customerId: input.customerId,
          approvedLimitMinor: Number(approved),
          calculatedBaseLimitMinor: Number(calculated),
        },
      });
      await this.activateMembershipIfPending(ctx, input.customerId, actor.id);
      return this.publicFacility(facility);
    });
  }

  async suspendCredit(principal: Principal, input: SuspendCreditInput) {
    const actor = toActor(principal);
    const facility = await this.prisma.creditFacility.findFirst({
      where: { customerId: input.customerId, scopeType: 'platform' },
    });
    if (!facility) throw new NotFoundException('No credit facility for customer');
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.creditFacility.update({
        where: { id: facility.id },
        data: { status: 'suspended' },
      });
      await ctx.tx.creditDecision.create({
        data: {
          id: newId(),
          facilityId: facility.id,
          decisionType: 'suspend',
          previousLimitMinor: facility.approvedLimitMinor,
          newLimitMinor: facility.approvedLimitMinor,
          reason: input.reason,
          decidedBy: actor.id ?? undefined,
        },
      });
      ctx.audit({
        action: 'CREDIT_SUSPENDED',
        targetType: 'CreditFacility',
        targetId: facility.id,
        reason: input.reason,
      });
      return this.publicFacility(updated);
    });
  }

  // ---- Membership + temporary onsite access ----------------------------------

  async setMembershipStatus(principal: Principal, input: SetMembershipStatusInput) {
    await this.requireCustomer(input.customerId);
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const membership = await this.currentMembership(ctx.tx, input.customerId, actor.id);
      const now = new Date();
      const updated = await ctx.tx.membership.update({
        where: { id: membership.id },
        data: {
          status: input.status,
          reason: input.reason,
          activatedAt: input.status === 'active' ? now : membership.activatedAt,
          suspendedAt: input.status === 'suspended' ? now : membership.suspendedAt,
          blockedAt: input.status === 'blocked' ? now : membership.blockedAt,
          updatedBy: actor.id ?? undefined,
        },
      });
      ctx.audit({
        action: 'MEMBERSHIP_STATUS_CHANGED',
        targetType: 'Membership',
        targetId: membership.id,
        before: { status: membership.status },
        after: { status: input.status },
        reason: input.reason,
      });
      if (input.status === 'active') {
        ctx.emit({
          name: DomainEventName.MembershipActivated,
          aggregateType: 'Customer',
          aggregateId: input.customerId,
          payload: { customerId: input.customerId },
        });
      } else if (input.status === 'suspended' || input.status === 'blocked') {
        ctx.emit({
          name: DomainEventName.MembershipSuspended,
          aggregateType: 'Customer',
          aggregateId: input.customerId,
          payload: { customerId: input.customerId, status: input.status },
        });
      }
      return this.publicMembership(updated);
    });
  }

  async grantTemporaryMembership(principal: Principal, input: GrantTemporaryMembershipInput) {
    await this.requireCustomer(input.customerId);
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const expiresAt = new Date(input.expiresAt);
      // The spot deposit is a verified security instrument backing the grant.
      const deposit = await ctx.tx.securityInstrument.create({
        data: {
          id: newId(),
          customerId: input.customerId,
          type: 'spot_deposit',
          currency: 'LKR',
          faceAmountMinor: BigInt(input.spotDepositMinor),
          eligibilityBps: FULL_FACTOR_BPS,
          eligibleAmountMinor: BigInt(input.spotDepositMinor),
          status: 'verified',
          verifiedAt: new Date(),
          verifiedBy: actor.id ?? undefined,
          expiresAt,
        },
      });
      const calculated = calculatedBaseLimitMinor({
        eligibleSecurityMinor: BigInt(input.spotDepositMinor),
        requiredSecurityBps: input.requiredSecurityBps,
      });
      const approved =
        input.approvedLimitMinor != null
          ? BigInt(Math.min(input.approvedLimitMinor, Number(calculated)))
          : calculated;
      const facility = await ctx.tx.creditFacility.create({
        data: {
          id: newId(),
          customerId: input.customerId,
          currency: 'LKR',
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          calculatedBaseLimitMinor: calculated,
          approvedLimitMinor: approved,
          requiredSecurityBps: input.requiredSecurityBps,
          status: 'active',
          startsAt: new Date(),
          expiresAt,
          approvedBy: actor.id ?? undefined,
          approvalReason: input.reason ?? 'Temporary onsite access',
        },
      });
      await ctx.tx.creditFacilitySecurity.create({
        data: { id: newId(), facilityId: facility.id, securityInstrumentId: deposit.id },
      });
      const membership = await this.currentMembership(ctx.tx, input.customerId, actor.id);
      await ctx.tx.membership.update({
        where: { id: membership.id },
        data: { status: 'temporary', expiresAt, updatedBy: actor.id ?? undefined },
      });
      const grant = await ctx.tx.membershipAccessGrant.create({
        data: {
          id: newId(),
          customerId: input.customerId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          startsAt: new Date(),
          expiresAt,
          securityInstrumentId: deposit.id,
          creditFacilityId: facility.id,
          grantedBy: actor.id ?? undefined,
          reason: input.reason,
          status: 'active',
        },
      });
      ctx.audit({
        action: 'TEMPORARY_MEMBERSHIP_GRANTED',
        targetType: 'Customer',
        targetId: input.customerId,
        after: { approvedLimitMinor: Number(approved), scopeType: input.scopeType },
      });
      ctx.emit({
        name: DomainEventName.TemporaryMembershipGranted,
        aggregateType: 'Customer',
        aggregateId: input.customerId,
        payload: {
          customerId: input.customerId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          approvedLimitMinor: Number(approved),
          expiresAt: expiresAt.toISOString(),
        },
      });
      return {
        grantId: grant.id,
        facility: this.publicFacility(facility),
        securityInstrumentId: deposit.id,
        approvedLimitMinor: Number(approved),
        calculatedBaseLimitMinor: Number(calculated),
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  // ---- Internal flags --------------------------------------------------------

  async createMemberFlag(principal: Principal, input: CreateMemberFlagInput) {
    await this.requireCustomer(input.customerId);
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const flag = await ctx.tx.memberFlag.create({
        data: {
          id,
          customerId: input.customerId,
          context: input.context,
          category: input.category,
          severity: input.severity,
          status: 'open',
          reasonCode: input.reasonCode,
          title: input.title,
          privateNote: input.privateNote,
          evidence: input.evidence as unknown as Prisma.InputJsonValue,
          createdBy: actor.id ?? undefined,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        },
      });
      // Audit records the author/reason/time; the private note/evidence are NOT
      // copied into the audit payload (§15 — no secrets in audit).
      ctx.audit({
        action: 'MEMBER_FLAG_CREATED',
        targetType: 'MemberFlag',
        targetId: id,
        after: { category: input.category, severity: input.severity },
      });
      ctx.emit({
        name: DomainEventName.MemberFlagCreated,
        aggregateType: 'Customer',
        aggregateId: input.customerId,
        payload: {
          customerId: input.customerId,
          category: input.category,
          severity: input.severity,
        },
      });
      return this.staffFlag(flag);
    });
  }

  async resolveMemberFlag(principal: Principal, id: string, input: ResolveMemberFlagInput) {
    const flag = await this.prisma.memberFlag.findUnique({ where: { id } });
    if (!flag) throw new NotFoundException('Flag not found');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.memberFlag.update({
        where: { id },
        data: {
          status: input.resolution === 'resolve' ? 'resolved' : 'dismissed',
          resolvedBy: actor.id ?? undefined,
          resolvedAt: new Date(),
          privateNote: input.note ?? flag.privateNote,
        },
      });
      ctx.audit({
        action: 'MEMBER_FLAG_RESOLVED',
        targetType: 'MemberFlag',
        targetId: id,
        after: { status: updated.status },
      });
      ctx.emit({
        name: DomainEventName.MemberFlagResolved,
        aggregateType: 'Customer',
        aggregateId: flag.customerId,
        payload: { customerId: flag.customerId, status: updated.status },
      });
      return this.staffFlag(updated);
    });
  }

  // ---- Performance -----------------------------------------------------------

  async recordPerformanceEvent(principal: Principal, input: RecordPerformanceEventInput) {
    await this.requireCustomer(input.customerId);
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.performanceEvent.create({
        data: {
          id: newId(),
          customerId: input.customerId,
          context: input.context,
          eventType: input.eventType,
          dimension: input.dimension,
          value: input.value,
          sourceEntityType: input.sourceEntityType,
          sourceEntityId: input.sourceEntityId,
        },
      });
      return this.recalcSnapshot(ctx, input.customerId, input.context, actor.id);
    });
  }

  async recalculatePerformance(
    principal: Principal,
    customerId: string,
    context: 'buyer' | 'seller',
  ) {
    await this.requireCustomer(customerId);
    const actor = toActor(principal);
    return this.uow.execute(actor, (ctx) =>
      this.recalcSnapshot(ctx, customerId, context, actor.id),
    );
  }

  private async recalcSnapshot(
    ctx: UowContext,
    customerId: string,
    context: 'buyer' | 'seller',
    actorId: string | null,
  ) {
    const events = await ctx.tx.performanceEvent.findMany({ where: { customerId, context } });
    const snapshot = computePerformanceSnapshot(
      rulesetForContext(context),
      events.map((e) => ({ eventType: e.eventType, dimension: e.dimension, value: e.value })),
    );
    await ctx.tx.performanceSnapshot.create({
      data: {
        id: newId(),
        customerId,
        context,
        score: snapshot.score,
        band: snapshot.band,
        ruleVersion: snapshot.ruleVersion,
        components: snapshot.dimensions as unknown as Prisma.InputJsonValue,
      },
    });
    ctx.emit({
      name: DomainEventName.PerformanceScoreUpdated,
      aggregateType: 'Customer',
      aggregateId: customerId,
      payload: { customerId, context, band: snapshot.band, score: snapshot.score },
    });
    void actorId;
    return snapshot;
  }

  // ---- Read projections ------------------------------------------------------

  /** Staff Member 360 (Revision 05 §20). Full internal view — role restricted. */
  async member360(principal: Principal, customerId: string) {
    if (!principal.permissions.has(Permission.MemberRead)) {
      throw new ForbiddenException('member:read required');
    }
    const customer = await this.requireCustomer(customerId);
    const [memberships, grants, securities, facility, flags, performance, org, crm] =
      await Promise.all([
        this.prisma.membership.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } }),
        this.prisma.membershipAccessGrant.findMany({
          where: { customerId, status: 'active' },
          orderBy: { expiresAt: 'desc' },
        }),
        this.prisma.securityInstrument.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
        }),
        this.exposure.availability(customerId),
        this.prisma.memberFlag.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } }),
        this.prisma.performanceSnapshot.findMany({
          where: { customerId },
          orderBy: { generatedAt: 'desc' },
          take: 2,
        }),
        this.prisma.organizationMember.findFirst({
          where: { customerId },
          include: { organization: true },
        }),
        // CRM strip (completion pass §3/§19): channel identities + open tasks + recent internal
        // notes. Staff-internal — folded into the staff 360, NEVER into the customer self view.
        this.crmCustomer.crmStrip(customerId),
      ]);
    return {
      clientReference: customer.clientReference,
      customerId: customer.id,
      legalName: customer.legalName,
      // Contact is masked in member SEARCH; the full 360 shows it to staff who opened the record.
      contact: { email: customer.email, phone: customer.phone },
      kycStatus: customer.kycStatus,
      roles: await this.deriveRoles(customerId),
      organization: org
        ? {
            reference: org.organization.organizationReference,
            legalName: org.organization.legalName,
          }
        : null,
      membership: memberships[0] ? this.publicMembership(memberships[0]) : null,
      temporaryAccess: grants.map((g) => ({
        scopeType: g.scopeType,
        scopeId: g.scopeId,
        expiresAt: g.expiresAt,
      })),
      credit: facility,
      security: securities.map((s) => this.publicInstrument(s)),
      flags: flags.map((f) => this.staffFlag(f)),
      performance: performance.map((p) => ({
        context: p.context,
        score: p.score,
        band: p.band,
        ruleVersion: p.ruleVersion,
        components: p.components,
        generatedAt: p.generatedAt,
      })),
      // Channel identities + open CRM tasks + recent internal notes (staff-only).
      channels: crm.channels,
      crm: { openTasks: crm.openTasks, recentNotes: crm.recentNotes },
    };
  }

  /**
   * Customer self view (§13/§21). NEVER exposes internal score, flags, staff notes
   * or investigations — it is a SEPARATE DTO, not the staff view with fields hidden.
   */
  async selfView(principal: Principal) {
    const customerId = principal.customerId;
    if (!customerId) throw new ForbiddenException('Authenticated customer required');
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const [membership, grants, securities, capacity] = await Promise.all([
      this.prisma.membership.findFirst({ where: { customerId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.membershipAccessGrant.findMany({ where: { customerId, status: 'active' } }),
      this.prisma.securityInstrument.findMany({
        where: { customerId, status: { in: ['verified', 'active', 'expired', 'release_pending'] } },
      }),
      this.exposure.availability(customerId),
    ]);
    return {
      clientReference: customer.clientReference,
      legalName: customer.legalName,
      roles: await this.deriveRoles(customerId),
      membership: membership
        ? { status: membership.status, expiresAt: membership.expiresAt }
        : { status: 'pending', expiresAt: null },
      kycStatus: customer.kycStatus,
      bidCapacity: {
        approvedMinor: capacity.approvedLimitMinor,
        committedMinor: capacity.committedMinor,
        availableMinor: capacity.availableMinor,
        currency: capacity.currency,
        hasFacility: capacity.hasFacility,
      },
      temporaryAccess: grants.map((g) => ({
        scopeType: g.scopeType,
        scopeId: g.scopeId,
        expiresAt: g.expiresAt,
      })),
      // Customer-safe security summary — bank-guarantee DOCUMENTS are never here.
      security: securities.map((s) => ({
        type: s.type,
        status: s.status,
        faceAmountMinor: Number(s.faceAmountMinor),
        currency: s.currency,
        issuingBank: s.issuingBank,
        expiresAt: s.expiresAt,
      })),
    };
  }

  /**
   * Staff member SEARCH (Revision 06 P1-10/P1-11). Look up a member by Client ID
   * (CUS-######), mobile, email, legal name or organisation — so staff never
   * paste raw ULIDs and the onsite desk finds an existing member before creating
   * a duplicate. `member:read` only; contact is MASKED in the list (open the 360
   * for full detail). Exact Client ID / contact rank above name substrings.
   */
  async search(principal: Principal, rawQuery: Record<string, unknown>) {
    if (!principal.permissions.has(Permission.MemberRead)) {
      throw new ForbiddenException('member:read required');
    }
    const q = String(rawQuery?.q ?? '').trim();
    const take = Math.min(Math.max(Math.trunc(Number(rawQuery?.limit) || 10), 1), 25);
    // A search box may fire on every keystroke — an empty/too-short query is not
    // an error, it just has no results yet.
    if (q.length < 2) return { query: q, count: 0, results: [] };

    const digits = q.replace(/\D/g, '');
    const insensitive = { contains: q, mode: 'insensitive' as const };
    const or: Prisma.CustomerWhereInput[] = [
      { clientReference: insensitive },
      { legalName: insensitive },
      { email: insensitive },
      { phone: insensitive },
      { organizationMembers: { some: { organization: { legalName: insensitive } } } },
      { organizationMembers: { some: { organization: { organizationReference: insensitive } } } },
    ];
    // Match a mobile even when it was stored with country code / formatting.
    if (digits.length >= 4) or.push({ phone: { contains: digits } });

    // Fetch a candidate pool a little larger than `take`, then rank exact matches
    // first before slicing — a name substring never outranks an exact Client ID.
    const customers = await this.prisma.customer.findMany({
      where: { OR: or },
      include: {
        memberships: { orderBy: { createdAt: 'desc' }, take: 1 },
        organizationMembers: { include: { organization: true }, take: 1 },
      },
      take: Math.min(take * 4, 80),
      orderBy: { createdAt: 'desc' },
    });

    const qLower = q.toLowerCase();
    const ranked = customers
      .map((c) => ({ c, rank: memberSearchRank(c, qLower, digits) }))
      .sort((a, b) => a.rank - b.rank || (a.c.legalName ?? '').localeCompare(b.c.legalName ?? ''))
      .slice(0, take);

    const results = await Promise.all(
      ranked.map(async ({ c }) => ({
        customerId: c.id,
        clientReference: c.clientReference,
        legalName: c.legalName,
        emailMasked: maskEmail(c.email),
        phoneMasked: maskPhone(c.phone),
        kycStatus: c.kycStatus,
        membershipStatus: c.memberships[0]?.status ?? 'pending',
        roles: await this.deriveRoles(c.id),
        organization: c.organizationMembers[0]
          ? {
              reference: c.organizationMembers[0].organization.organizationReference,
              legalName: c.organizationMembers[0].organization.legalName,
            }
          : null,
      })),
    );
    return { query: q, count: results.length, results };
  }

  /**
   * Canonical credit policy (Rev 06.2 §8): the SINGLE backend source for the
   * required-security ratio, enforcement mode and policy version. Frontend
   * previews, staff approval and temporary grants read this rather than
   * hard-coding 5%. Public — it carries no member data. Safe defaults: 5%
   * (500 bps), `facility`, `v1`.
   */
  async creditPolicy() {
    const [bps, enforcement, version, kyc] = await Promise.all([
      this.prisma.businessConfig.findUnique({ where: { key: 'credit.requiredSecurityBps' } }),
      this.prisma.businessConfig.findUnique({ where: { key: 'credit.enforcement' } }),
      this.prisma.businessConfig.findUnique({ where: { key: 'credit.policyVersion' } }),
      this.prisma.businessConfig.findUnique({ where: { key: 'credit.kycPolicy' } }),
    ]);
    const parsedBps = Number(bps?.value);
    const requiredSecurityBps = Number.isFinite(parsedBps) && parsedBps > 0 ? parsedBps : 500;
    const enf = enforcement?.value;
    const mode = enf === 'off' || enf === 'strict' || enf === 'facility' ? enf : 'facility';
    return {
      requiredSecurityBps,
      capacityMultiple: 10_000 / requiredSecurityBps,
      enforcement: mode,
      kycPolicy: kyc?.value === 'required' ? 'required' : 'off',
      policyVersion: version?.value || 'v1',
    };
  }

  // ---- helpers ---------------------------------------------------------------

  private async deriveRoles(customerId: string): Promise<Array<'buyer' | 'seller'>> {
    // One durable Customer can be Buyer, Seller or Both (§1) — derived, not stored
    // as a second record. Seller = owns assets or belongs to a seller organization.
    const [assets, member] = await Promise.all([
      this.prisma.asset.count({ where: { ownerCustomerId: customerId } }),
      this.prisma.organizationMember.count({ where: { customerId } }),
    ]);
    const roles: Array<'buyer' | 'seller'> = ['buyer'];
    if (assets > 0 || member > 0) roles.push('seller');
    return roles;
  }

  private async currentMembership(
    tx: UowContext['tx'],
    customerId: string,
    actorId: string | null,
  ) {
    const found = await tx.membership.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    if (found) return found;
    return tx.membership.create({
      data: { id: newId(), customerId, status: 'pending', createdBy: actorId ?? undefined },
    });
  }

  private async activateMembershipIfPending(
    ctx: UowContext,
    customerId: string,
    actorId: string | null,
  ) {
    const membership = await this.currentMembership(ctx.tx, customerId, actorId);
    if (membership.status === 'pending') {
      await ctx.tx.membership.update({
        where: { id: membership.id },
        data: { status: 'active', activatedAt: new Date(), updatedBy: actorId ?? undefined },
      });
    }
  }

  private async requireCustomer(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private publicInstrument(s: {
    id: string;
    type: string;
    status: string;
    currency: string;
    faceAmountMinor: bigint;
    eligibleAmountMinor: bigint;
    eligibilityBps: number;
    issuingBank: string | null;
    guaranteeNumber: string | null;
    expiresAt: Date | null;
    verifiedAt: Date | null;
    // documentMediaId intentionally omitted from the staff list view — private.
  }) {
    return {
      id: s.id,
      type: s.type,
      status: s.status,
      currency: s.currency,
      faceAmountMinor: Number(s.faceAmountMinor),
      eligibleAmountMinor: Number(s.eligibleAmountMinor),
      eligibilityBps: s.eligibilityBps,
      issuingBank: s.issuingBank,
      guaranteeNumber: s.guaranteeNumber,
      expiresAt: s.expiresAt,
      verifiedAt: s.verifiedAt,
    };
  }

  private publicFacility(f: {
    id: string;
    customerId: string;
    currency: string;
    scopeType: string;
    calculatedBaseLimitMinor: bigint;
    approvedLimitMinor: bigint;
    temporaryUpliftMinor: bigint;
    status: string;
    requiredSecurityBps: number;
    expiresAt: Date | null;
  }) {
    return {
      id: f.id,
      customerId: f.customerId,
      currency: f.currency,
      scopeType: f.scopeType,
      calculatedBaseLimitMinor: Number(f.calculatedBaseLimitMinor),
      approvedLimitMinor: Number(f.approvedLimitMinor),
      temporaryUpliftMinor: Number(f.temporaryUpliftMinor),
      requiredSecurityBps: f.requiredSecurityBps,
      status: f.status,
      expiresAt: f.expiresAt,
    };
  }

  private publicMembership(m: {
    id: string;
    status: string;
    activatedAt: Date | null;
    expiresAt: Date | null;
    reason: string | null;
  }) {
    return {
      id: m.id,
      status: m.status,
      activatedAt: m.activatedAt,
      expiresAt: m.expiresAt,
      reason: m.reason,
    };
  }

  private staffFlag(f: {
    id: string;
    context: string;
    category: string;
    severity: string;
    status: string;
    reasonCode: string;
    title: string;
    privateNote: string | null;
    createdBy: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
  }) {
    return {
      id: f.id,
      context: f.context,
      category: f.category,
      severity: f.severity,
      status: f.status,
      reasonCode: f.reasonCode,
      title: f.title,
      privateNote: f.privateNote,
      createdBy: f.createdBy,
      createdAt: f.createdAt,
      resolvedAt: f.resolvedAt,
    };
  }
}

// ---- member-search helpers (pure) --------------------------------------------

/** Rank a candidate against the query: exact Client ID (0) > exact contact (1) >
 *  prefix (2) > substring (3), so a name substring never outranks an exact ID. */
function memberSearchRank(
  c: {
    clientReference: string | null;
    email: string | null;
    phone: string | null;
    legalName: string | null;
  },
  qLower: string,
  digits: string,
): number {
  const ref = (c.clientReference ?? '').toLowerCase();
  const email = (c.email ?? '').toLowerCase();
  const phoneDigits = (c.phone ?? '').replace(/\D/g, '');
  if (ref && ref === qLower) return 0;
  if ((email && email === qLower) || (digits.length >= 6 && phoneDigits === digits)) return 1;
  if (ref.startsWith(qLower) || (c.legalName ?? '').toLowerCase().startsWith(qLower)) return 2;
  return 3;
}

/** Mask an email for a staff list — keeps enough to disambiguate, not the whole
 *  address (open the 360 for full contact). e.g. `jo•••@example.com`. */
function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return '•••';
  const user = email.slice(0, at);
  const head = user.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(1, user.length - head.length))}@${email.slice(at + 1)}`;
}

/** Mask a phone to its last four digits, e.g. `••••4567`. */
function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '•'.repeat(Math.max(1, digits.length));
  return `••••${digits.slice(-4)}`;
}
