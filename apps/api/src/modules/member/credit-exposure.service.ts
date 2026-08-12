import { Injectable } from '@nestjs/common';
import { DomainEventName, newId } from '@singha/contracts';
import { computeCreditAvailability, fitsWithinCapacity } from '@singha/domain';
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
    excludeSource?: { sourceType: string; sourceId: string },
  ): Promise<bigint> {
    const rows = await tx.creditReservation.findMany({
      where: { customerId, status: { in: ['active', 'converted'] } },
      select: { amountMinor: true, sourceType: true, sourceId: true },
    });
    return rows.reduce((sum, r) => {
      if (
        excludeSource &&
        r.sourceType === excludeSource.sourceType &&
        r.sourceId === excludeSource.sourceId
      ) {
        return sum;
      }
      return sum + r.amountMinor;
    }, 0n);
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

    // Serialize concurrent bids for this customer by locking the facility row.
    const locked = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM credit_facility WHERE customer_id = $1 AND status = 'active' ORDER BY created_at LIMIT 1 FOR UPDATE`,
      input.customerId,
    );
    const facilityId = locked[0]?.id;

    if (!facilityId) {
      // No standing facility: cash bidder. Allowed under `facility`, denied under `strict`.
      return mode === 'strict'
        ? { ok: false, reason: DenialReason.AuctionRegistrationRequired }
        : { ok: true };
    }

    const facility = await tx.creditFacility.findUniqueOrThrow({ where: { id: facilityId } });

    // Expired facility no longer supports new exposure (§9).
    if (facility.expiresAt && facility.expiresAt <= new Date()) {
      return { ok: false, reason: DenialReason.SecurityExpired };
    }

    const committed = await this.committedExposureMinor(tx, input.customerId, {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });

    const fits = fitsWithinCapacity({
      approvedLimitMinor: facility.approvedLimitMinor,
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
        facilityId,
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
      aggregateId: facilityId,
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
    // Same canonical committed calc as the bid-admission gate (§3).
    const committed = await this.committedExposureMinor(this.prisma, customerId);
    const a = computeCreditAvailability({
      approvedLimitMinor: facility.approvedLimitMinor,
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
