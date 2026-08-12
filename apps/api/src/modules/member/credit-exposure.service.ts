import { Injectable } from '@nestjs/common';
import { DomainEventName, newId } from '@singha/contracts';
import {
  calculatedBaseLimitMinor,
  computeCreditAvailability,
  fitsWithinCapacity,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { type UowContext } from '../../shared/persistence/unit-of-work';

/** Deterministic bid-denial reason codes (Revision 05 §17). */
export const DenialReason = {
  MembershipInactive: 'MEMBERSHIP_INACTIVE',
  TemporaryAccessExpired: 'TEMPORARY_ACCESS_EXPIRED',
  KycRequired: 'KYC_REQUIRED',
  CreditLimitExceeded: 'CREDIT_LIMIT_EXCEEDED',
  SecurityExpired: 'SECURITY_EXPIRED',
  AccountSuspended: 'ACCOUNT_SUSPENDED',
  AuctionRegistrationRequired: 'AUCTION_REGISTRATION_REQUIRED',
} as const;
export type DenialReason = (typeof DenialReason)[keyof typeof DenialReason];

export type ReserveResult = { ok: true } | { ok: false; reason: DenialReason };

/**
 * Enforcement policy (configurable via BusinessConfig `credit.enforcement`):
 *  - `off`      : no capacity check (legacy/cash-only events).
 *  - `facility` : enforce ONLY when the bidder has a credit facility — cash bidders
 *                 without a standing facility bid as before (default, conservative).
 *  - `strict`   : every bidder must hold an active facility with capacity.
 */
type Enforcement = 'off' | 'facility' | 'strict';
const DEFAULT_ENFORCEMENT: Enforcement = 'facility';

/**
 * Narrow, concurrency-safe eligibility + exposure gate that the proven auction
 * engine calls WITHOUT being rewritten (Revision 05 §16/§7). Runs inside the
 * caller's bid transaction; row-locks the customer's credit facility so two
 * simultaneous bids for the same customer on different lots cannot both consume
 * the same remaining capacity. `available = effectiveApprovedLimit − committed`.
 */
@Injectable()
export class CreditExposureService {
  constructor(private readonly prisma: PrismaService) {}

  private async enforcement(tx: UowContext['tx']): Promise<Enforcement> {
    const cfg = await tx.businessConfig.findUnique({ where: { key: 'credit.enforcement' } });
    const v = cfg?.value as Enforcement | undefined;
    return v === 'off' || v === 'strict' || v === 'facility' ? v : DEFAULT_ENFORCEMENT;
  }

  /**
   * The ONE canonical committed-exposure calculation (Rev 06.2 §3): ACTIVE
   * reservations PLUS CONVERTED (won-but-unpaid) reservations. Used identically by
   * bid admission, Member Self and Member 360, so a customer never regains
   * capacity merely by winning — only authoritative payment/release (which flips
   * the reservation to `released`) frees it. Accepts a tx OR the base client so
   * the in-transaction gate and the read projection share one definition.
   */
  async committedExposureMinor(
    tx: UowContext['tx'],
    customerId: string,
    opts?: {
      excludeSource?: { sourceType: string; sourceId: string };
      /** Restrict to one facility's own exposure (its scoped capacity, §4). */
      facilityId?: string;
    },
  ): Promise<bigint> {
    const rows = await tx.creditReservation.findMany({
      where: {
        customerId,
        status: { in: ['active', 'converted'] },
        ...(opts?.facilityId ? { facilityId: opts.facilityId } : {}),
      },
      select: { amountMinor: true, sourceType: true, sourceId: true },
    });
    const ex = opts?.excludeSource;
    return rows.reduce((sum, r) => {
      if (ex && r.sourceType === ex.sourceType && r.sourceId === ex.sourceId) return sum;
      return sum + r.amountMinor;
    }, 0n);
  }

  /**
   * The facility's approved limit re-derived from CURRENTLY eligible supporting
   * security (§6): expired, released, rejected or unverified instruments count for
   * zero, so a lapsed bank guarantee cannot keep backing new exposure. A facility
   * with no linked securities keeps its approved limit (nothing to revalidate).
   * `securityExhausted` is true when linked security exists but none is eligible.
   */
  async effectiveApprovedLimitMinor(
    tx: UowContext['tx'],
    facility: { id: string; approvedLimitMinor: bigint; requiredSecurityBps: number },
  ): Promise<{ limit: bigint; securityExhausted: boolean }> {
    const links = await tx.creditFacilitySecurity.findMany({
      where: { facilityId: facility.id },
      select: {
        security: { select: { status: true, expiresAt: true, eligibleAmountMinor: true } },
      },
    });
    if (links.length === 0) return { limit: facility.approvedLimitMinor, securityExhausted: false };
    const now = new Date();
    const eligible = links.reduce((sum, l) => {
      const s = l.security;
      const valid =
        (s.status === 'verified' || s.status === 'active') && (!s.expiresAt || s.expiresAt > now);
      return valid ? sum + s.eligibleAmountMinor : sum;
    }, 0n);
    if (eligible === 0n) return { limit: 0n, securityExhausted: true };
    const supported = calculatedBaseLimitMinor({
      eligibleSecurityMinor: eligible,
      requiredSecurityBps: facility.requiredSecurityBps,
    });
    return {
      limit: supported < facility.approvedLimitMinor ? supported : facility.approvedLimitMinor,
      securityExhausted: false,
    };
  }

  /**
   * Check membership/status eligibility and reserve `amountMinor` of capacity for
   * `(sourceType, sourceId)` atomically. Idempotent per source: a higher max on the
   * same lot updates the reservation in place rather than stacking exposure.
   */
  async checkAndReserve(
    ctx: UowContext,
    input: {
      customerId: string;
      sourceType: string;
      sourceId: string;
      amountMinor: bigint;
      currency: string;
      /** Where this exposure occurs, so a scoped facility is chosen (§4). */
      scope?: { auctionId?: string; eventId?: string | null; category?: string | null };
    },
  ): Promise<ReserveResult> {
    const { tx } = ctx;
    const mode = await this.enforcement(tx);
    if (mode === 'off') return { ok: true };

    // Membership must not be suspended/blocked (§17). A missing membership row is
    // treated as legacy-eligible so pre-existing bidders are unaffected.
    const membership = await tx.membership.findFirst({
      where: { customerId: input.customerId },
      orderBy: { createdAt: 'desc' },
    });
    if (membership) {
      if (membership.status === 'suspended')
        return { ok: false, reason: DenialReason.AccountSuspended };
      if (membership.status === 'blocked')
        return { ok: false, reason: DenialReason.AccountSuspended };
      if (membership.status === 'expired')
        return { ok: false, reason: DenialReason.TemporaryAccessExpired };
    }

    // Lock ALL of the customer's active facilities (serialises concurrent bids for
    // this customer — Race A) then choose the one whose scope covers THIS auction/
    // event, most specific first (§4: AUCTION → EVENT → PLATFORM). Facilities are
    // never aggregated.
    const locked = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM credit_facility WHERE customer_id = $1 AND status = 'active' FOR UPDATE`,
      input.customerId,
    );
    const facilities = locked.length
      ? await tx.creditFacility.findMany({ where: { id: { in: locked.map((l) => l.id) } } })
      : [];
    const facility = selectFacilityForScope(facilities, input.scope);

    if (!facility) {
      // A customer with NO facility at all is a cash bidder (allowed under
      // `facility`, denied under `strict`). A customer who HAS facilities but none
      // for THIS scope — e.g. an Event-A grant bidding Event B — is denied: their
      // scoped credit does not reach here (§4).
      if (facilities.length === 0) {
        return mode === 'strict'
          ? { ok: false, reason: DenialReason.AuctionRegistrationRequired }
          : { ok: true };
      }
      return { ok: false, reason: DenialReason.AuctionRegistrationRequired };
    }

    // Expired facility no longer supports new exposure (§6). A scoped/temporary
    // facility reports TEMPORARY_ACCESS_EXPIRED; a standing platform one SECURITY_EXPIRED.
    if (facility.expiresAt && facility.expiresAt <= new Date()) {
      return {
        ok: false,
        reason:
          facility.scopeType === 'platform'
            ? DenialReason.SecurityExpired
            : DenialReason.TemporaryAccessExpired,
      };
    }

    // §6: revalidate supporting security AT bid time — a lapsed instrument reduces
    // (or removes) the facility's effective limit even if the facility itself has
    // not expired.
    const effective = await this.effectiveApprovedLimitMinor(tx, facility);
    if (effective.securityExhausted) {
      return { ok: false, reason: DenialReason.SecurityExpired };
    }

    // Committed against THIS facility only — its own scoped capacity (§4/§3).
    const committed = await this.committedExposureMinor(tx, input.customerId, {
      excludeSource: { sourceType: input.sourceType, sourceId: input.sourceId },
      facilityId: facility.id,
    });

    const fits = fitsWithinCapacity({
      approvedLimitMinor: effective.limit,
      temporaryUpliftMinor: facility.temporaryUpliftMinor,
      committedExposureMinor: committed,
      requestedMinor: input.amountMinor,
    });
    if (!fits) return { ok: false, reason: DenialReason.CreditLimitExceeded };

    await tx.creditReservation.upsert({
      where: {
        sourceType_sourceId: { sourceType: input.sourceType, sourceId: input.sourceId },
      },
      update: { amountMinor: input.amountMinor, status: 'active', releasedAt: null },
      create: {
        id: newId(),
        customerId: input.customerId,
        facilityId: facility.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: 'active',
      },
    });

    ctx.emit({
      name: DomainEventName.CreditReservationCreated,
      aggregateType: 'CreditFacility',
      aggregateId: facility.id,
      payload: {
        customerId: input.customerId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        amountMinor: Number(input.amountMinor),
      },
    });
    return { ok: true };
  }

  /** Release the reservation for a source (e.g. an auction loser at close). */
  async release(ctx: UowContext, sourceType: string, sourceId: string): Promise<void> {
    const existing = await ctx.tx.creditReservation.findUnique({
      where: { sourceType_sourceId: { sourceType, sourceId } },
    });
    if (!existing || existing.status !== 'active') return;
    await ctx.tx.creditReservation.update({
      where: { id: existing.id },
      data: { status: 'released', releasedAt: new Date() },
    });
    ctx.emit({
      name: DomainEventName.CreditReservationReleased,
      aggregateType: 'CreditFacility',
      aggregateId: existing.facilityId,
      payload: { customerId: existing.customerId, sourceType, sourceId },
    });
  }

  /** Convert a winning reservation into unpaid-purchase exposure (kept committed). */
  async convertToSale(
    ctx: UowContext,
    sourceType: string,
    sourceId: string,
    saleId: string,
  ): Promise<void> {
    const existing = await ctx.tx.creditReservation.findUnique({
      where: { sourceType_sourceId: { sourceType, sourceId } },
    });
    if (!existing || existing.status !== 'active') return;
    await ctx.tx.creditReservation.update({
      where: { id: existing.id },
      data: { status: 'converted', convertedToSaleId: saleId },
    });
  }

  /** Release the purchase exposure once the sale is paid (§16). */
  async releaseForSale(ctx: UowContext, saleId: string): Promise<void> {
    const rows = await ctx.tx.creditReservation.findMany({
      where: { convertedToSaleId: saleId, status: 'converted' },
    });
    for (const r of rows) {
      await ctx.tx.creditReservation.update({
        where: { id: r.id },
        data: { status: 'released', releasedAt: new Date() },
      });
      ctx.emit({
        name: DomainEventName.CreditReservationReleased,
        aggregateType: 'CreditFacility',
        aggregateId: r.facilityId,
        payload: { customerId: r.customerId, saleId },
      });
    }
  }

  /** Read-only availability projection for dashboards / Member 360. */
  async availability(customerId: string) {
    const facility = await this.prisma.creditFacility.findFirst({
      where: { customerId, status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
    if (!facility) {
      return {
        currency: 'LKR',
        approvedLimitMinor: 0,
        temporaryUpliftMinor: 0,
        committedMinor: 0,
        availableMinor: 0,
        hasFacility: false,
      };
    }
    // Same canonical committed calc as the gate, restricted to this facility's own
    // scoped exposure (§3/§4).
    const committed = await this.committedExposureMinor(this.prisma, customerId, {
      facilityId: facility.id,
    });
    // Reflect currently-eligible supporting security in the shown limit (§6): if a
    // backing guarantee has lapsed, new capacity drops to zero — but the committed
    // obligation is retained (debt is never erased).
    const effective = await this.effectiveApprovedLimitMinor(this.prisma, facility);
    const a = computeCreditAvailability({
      approvedLimitMinor: effective.limit,
      temporaryUpliftMinor: facility.temporaryUpliftMinor,
      committedExposureMinor: committed,
    });
    return {
      currency: facility.currency,
      approvedLimitMinor: Number(a.effectiveApprovedLimitMinor),
      temporaryUpliftMinor: Number(facility.temporaryUpliftMinor),
      committedMinor: Number(a.committedExposureMinor),
      availableMinor: Number(a.availableMinor),
      hasFacility: true,
      expiresAt: facility.expiresAt,
    };
  }
}

/**
 * Choose the facility whose scope covers a transaction, most specific first
 * (§4: AUCTION → EVENT → PLATFORM). Never aggregates facilities. Returns
 * undefined when the customer has no facility that reaches this auction/event.
 */
function selectFacilityForScope<
  F extends { scopeType: string; scopeId: string | null; createdAt: Date },
>(
  facilities: F[],
  scope: { auctionId?: string; eventId?: string | null; category?: string | null } | undefined,
): F | undefined {
  const applies = (f: F): boolean => {
    switch (f.scopeType) {
      case 'platform':
        return true;
      case 'event':
        return !!scope?.eventId && f.scopeId === scope.eventId;
      case 'auction':
        return !!scope?.auctionId && f.scopeId === scope.auctionId;
      case 'category':
        return !!scope?.category && f.scopeId === scope.category;
      default:
        return false;
    }
  };
  const rank: Record<string, number> = { auction: 0, event: 1, category: 1, platform: 2 };
  return facilities
    .filter(applies)
    .sort(
      (a, b) =>
        (rank[a.scopeType] ?? 9) - (rank[b.scopeType] ?? 9) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )[0];
}
