import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DomainEventName,
  Permission,
  type ReviewEoiInput,
  type SubmitEoiInput,
  newId,
} from '@singha/contracts';
import { EOI_REVIEW_DECISIONS, type EoiStatus, assertEoiTransition } from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

type EoiRow = {
  id: string;
  listingId: string;
  customerId: string;
  status: EoiStatus;
  amountMinor: bigint | null;
  currency: string;
  message: string | null;
  conditions: string | null;
  expiresAt: Date | null;
  reviewNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Expression-of-Interest orchestration (docs/07 — EOI). EOI values are PRIVATE:
 * amount/message/conditions are only ever returned to the submitter or to staff
 * holding `eoi:review`; they are NEVER exposed to competing bidders. Status moves
 * are validated by the domain state machine and appended to an immutable
 * EoiEvent history.
 */
@Injectable()
export class EoiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {}

  async submit(principal: Principal, input: SubmitEoiInput) {
    const customerId = principal.customerId;
    if (!customerId) throw new ForbiddenException('EOI requires an authenticated customer');

    const listing = await this.prisma.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.saleMethod !== 'EXPRESSION_OF_INTEREST') {
      throw new ConflictException('Listing does not accept expressions of interest');
    }

    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const eoi = (await ctx.tx.eoi.create({
        data: {
          id,
          listingId: input.listingId,
          customerId,
          status: 'submitted',
          amountMinor: input.amountMinor == null ? null : BigInt(input.amountMinor),
          currency: input.currency,
          message: input.message,
          conditions: input.conditions,
          expiresAt: input.expiresAt == null ? null : new Date(input.expiresAt),
        },
      })) as EoiRow;
      await ctx.tx.eoiEvent.create({
        data: {
          id: newId(),
          eoiId: id,
          fromStatus: 'submitted',
          toStatus: 'submitted',
          note: 'submitted',
          actorType: actor.type,
          actorId: actor.id,
        },
      });
      ctx.emit({
        name: DomainEventName.EoiSubmitted,
        aggregateType: 'Eoi',
        aggregateId: id,
        payload: { eoiId: id, listingId: input.listingId, customerId },
      });
      ctx.audit({
        action: 'EOI_SUBMITTED',
        targetType: 'Eoi',
        targetId: id,
        after: { listingId: input.listingId },
      });
      return this.ownerView(eoi);
    });
  }

  /** Staff decision that transitions the EOI (docs/07 states). */
  async review(principal: Principal, id: string, input: ReviewEoiInput) {
    const eoi = (await this.prisma.eoi.findUnique({ where: { id } })) as EoiRow | null;
    if (!eoi) throw new NotFoundException('EOI not found');

    const to = EOI_REVIEW_DECISIONS[input.decision];
    assertEoiTransition(eoi.status, to);

    const actor = toActor(principal);
    const terminal = to === 'accepted' || to === 'declined';
    return this.uow.execute(actor, async (ctx) => {
      const updated = (await ctx.tx.eoi.update({
        where: { id },
        data: {
          status: to,
          reviewNote: input.note ?? eoi.reviewNote,
          decidedAt: terminal ? new Date() : eoi.decidedAt,
        },
      })) as EoiRow;
      await ctx.tx.eoiEvent.create({
        data: {
          id: newId(),
          eoiId: id,
          fromStatus: eoi.status,
          toStatus: to,
          note: input.note,
          actorType: actor.type,
          actorId: actor.id,
        },
      });
      ctx.emit({
        name: to === 'accepted' ? DomainEventName.EoiAccepted : DomainEventName.EoiReviewed,
        aggregateType: 'Eoi',
        aggregateId: id,
        payload: { eoiId: id, listingId: eoi.listingId, status: to },
      });
      ctx.audit({
        action: `EOI_${to.toUpperCase()}`,
        targetType: 'Eoi',
        targetId: id,
        before: { status: eoi.status },
        after: { status: to },
      });
      return this.staffView(updated);
    });
  }

  /** The submitter withdraws their own EOI (unless already terminal). */
  async withdraw(principal: Principal, id: string) {
    const eoi = (await this.prisma.eoi.findUnique({ where: { id } })) as EoiRow | null;
    if (!eoi) throw new NotFoundException('EOI not found');
    if (eoi.customerId !== principal.customerId) {
      throw new ForbiddenException('You can only withdraw your own EOI');
    }
    assertEoiTransition(eoi.status, 'withdrawn');

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = (await ctx.tx.eoi.update({
        where: { id },
        data: { status: 'withdrawn', decidedAt: new Date() },
      })) as EoiRow;
      await ctx.tx.eoiEvent.create({
        data: {
          id: newId(),
          eoiId: id,
          fromStatus: eoi.status,
          toStatus: 'withdrawn',
          note: 'withdrawn by submitter',
          actorType: actor.type,
          actorId: actor.id,
        },
      });
      ctx.emit({
        name: DomainEventName.EoiWithdrawn,
        aggregateType: 'Eoi',
        aggregateId: id,
        payload: { eoiId: id, listingId: eoi.listingId },
      });
      ctx.audit({ action: 'EOI_WITHDRAWN', targetType: 'Eoi', targetId: id });
      return this.ownerView(updated);
    });
  }

  /** A single EOI, readable by its submitter or by staff with `eoi:review`. */
  async get(principal: Principal, id: string) {
    const eoi = (await this.prisma.eoi.findUnique({ where: { id } })) as EoiRow | null;
    if (!eoi) throw new NotFoundException('EOI not found');
    const isStaff = principal.permissions.has(Permission.EoiReview);
    if (!isStaff && eoi.customerId !== principal.customerId) {
      throw new ForbiddenException('Not permitted to view this EOI');
    }
    return isStaff ? this.staffView(eoi) : this.ownerView(eoi);
  }

  /** The caller's own EOIs (never anyone else's values). */
  async mine(principal: Principal) {
    if (!principal.customerId) throw new ForbiddenException('Authentication required');
    const rows = (await this.prisma.eoi.findMany({
      where: { customerId: principal.customerId },
      orderBy: { createdAt: 'desc' },
    })) as EoiRow[];
    return rows.map((r) => this.ownerView(r));
  }

  /** Staff-only: every EOI on a listing, WITH values (docs/07 — controlled). */
  async listForListing(listingId: string) {
    const rows = (await this.prisma.eoi.findMany({
      where: { listingId },
      orderBy: [{ amountMinor: 'desc' }, { createdAt: 'asc' }],
    })) as EoiRow[];
    return rows.map((r) => this.staffView(r));
  }

  private base(e: EoiRow) {
    return {
      id: e.id,
      listingId: e.listingId,
      status: e.status,
      currency: e.currency,
      amountMinor: e.amountMinor == null ? null : Number(e.amountMinor),
      expiresAt: e.expiresAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  /** Submitter's own view — includes their message/conditions. */
  private ownerView(e: EoiRow) {
    return { ...this.base(e), message: e.message, conditions: e.conditions };
  }

  /** Staff view — adds submitter identity + review note (still no competitor cross-exposure). */
  private staffView(e: EoiRow) {
    return {
      ...this.base(e),
      customerId: e.customerId,
      message: e.message,
      conditions: e.conditions,
      reviewNote: e.reviewNote,
      decidedAt: e.decidedAt,
    };
  }
}
