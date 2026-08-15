import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type DecideCapabilityInput,
  type RequestCapabilityInput,
  type UpdateSinghaProfileInput,
  newId,
} from '@singha/contracts';
import {
  type CapabilityGrant,
  type CapabilityStatus,
  activityRequiresCapability,
  assertCapabilityDecidable,
  effectiveCapabilityStatus,
  evaluateCapability,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

/**
 * Singha ID service (Evolution E11, pack doc 11 §Singha ID). One geography-neutral profile extends
 * the Customer, and verification is **capability-based**: browse broadly, verify only when an
 * activity requires it. An operator decides a requested capability (server-side authority); the
 * evidence bar per activity/market is owner-gated (register O7). Flag-gated by `singhaId`.
 */
@Injectable()
export class SinghaIdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly config: AppConfigService,
  ) {}

  private requireFeature(): void {
    if (!this.config.get().features.singhaId) {
      throw new NotFoundException('Singha ID is not enabled');
    }
  }

  private customer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  /** The caller's profile (defaults when none has been saved yet). */
  async getProfile(principal: Principal) {
    this.requireFeature();
    const customerId = this.customer(principal);
    const row = await this.prisma.customerProfile.findUnique({ where: { customerId } });
    return {
      customerId,
      countryResidency: row?.countryResidency ?? null,
      displayCurrency: row?.displayCurrency ?? null,
      language: row?.language ?? null,
      timezone: row?.timezone ?? null,
      companyRoles: row?.companyRoles ?? [],
      notificationPrefs: row?.notificationPrefs ?? {},
    };
  }

  /** Upsert the caller's profile preferences (partial patch). */
  async updateProfile(principal: Principal, input: UpdateSinghaProfileInput) {
    this.requireFeature();
    const customerId = this.customer(principal);
    const actor = toActor(principal);
    const id = newId();
    const patch = {
      countryResidency: input.countryResidency,
      displayCurrency: input.displayCurrency,
      language: input.language,
      timezone: input.timezone,
      companyRoles: input.companyRoles,
      notificationPrefs: input.notificationPrefs,
    };
    return this.uow.execute(actor, async (ctx) => {
      const row = await ctx.tx.customerProfile.upsert({
        where: { customerId },
        create: { id, customerId, ...patch },
        update: patch,
      });
      ctx.audit({
        action: 'SINGHA_ID_PROFILE_UPDATED',
        targetType: 'CustomerProfile',
        targetId: row.id,
      });
      return { customerId, updated: true };
    });
  }

  /** The caller's capability grants. */
  async listCapabilities(principal: Principal) {
    this.requireFeature();
    const rows = await this.prisma.customerCapability.findMany({
      where: { customerId: this.customer(principal) },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return rows.map((r) => ({
      capability: r.capability,
      status: effectiveCapabilityStatus(this.grantView(r), now),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    }));
  }

  /** Request (or re-open) a capability — starts a fresh pending verification. */
  async requestCapability(principal: Principal, input: RequestCapabilityInput) {
    this.requireFeature();
    const customerId = this.customer(principal);
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const row = await ctx.tx.customerCapability.upsert({
        where: { customerId_capability: { customerId, capability: input.capability } },
        create: {
          id,
          customerId,
          capability: input.capability,
          status: 'pending',
          evidenceRef: input.evidenceRef,
        },
        update: {
          status: 'pending',
          evidenceRef: input.evidenceRef,
          verifiedAt: null,
          expiresAt: null,
          decidedByCustomerId: null,
        },
      });
      ctx.audit({
        action: 'SINGHA_ID_CAPABILITY_REQUESTED',
        targetType: 'CustomerCapability',
        targetId: row.id,
      });
      return { capability: row.capability, status: row.status };
    });
  }

  /** Evaluate whether the caller may perform an activity (capability-based gate). */
  async evaluate(principal: Principal, activity: string) {
    this.requireFeature();
    const customerId = this.customer(principal);
    const required = activityRequiresCapability(activity);
    const grant = required
      ? await this.prisma.customerCapability.findUnique({
          where: { customerId_capability: { customerId, capability: required } },
        })
      : null;
    return evaluateCapability(activity, grant ? this.grantView(grant) : null, new Date());
  }

  /** An operator decides a member's pending capability (verified / rejected). The authority is the
   *  `exchange:operate` permission (enforced at the controller); the operator need not be a customer. */
  async decide(principal: Principal, input: DecideCapabilityInput) {
    this.requireFeature();
    const deciderId = principal.customerId ?? null;
    const grant = await this.prisma.customerCapability.findUnique({
      where: {
        customerId_capability: { customerId: input.customerId, capability: input.capability },
      },
    });
    if (!grant) throw new NotFoundException('Capability request not found');
    assertCapabilityDecidable(grant.status as CapabilityStatus);
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const row = await ctx.tx.customerCapability.update({
        where: { id: grant.id },
        data: {
          status: input.decision,
          decidedByCustomerId: deciderId,
          verifiedAt: input.decision === 'verified' ? new Date() : null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      ctx.audit({
        action: 'SINGHA_ID_CAPABILITY_DECIDED',
        targetType: 'CustomerCapability',
        targetId: row.id,
        after: { status: row.status },
      });
      return { customerId: row.customerId, capability: row.capability, status: row.status };
    });
  }

  private grantView(r: {
    capability: string;
    status: string;
    expiresAt: Date | null;
  }): CapabilityGrant {
    return {
      capability: r.capability,
      status: r.status as CapabilityStatus,
      expiresAt: r.expiresAt,
    };
  }
}
