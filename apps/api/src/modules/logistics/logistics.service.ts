import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { INCOTERMS, type QuoteRequest, type ShipmentEventInput, newId } from '@singha/contracts';
import {
  type ShipmentStatus,
  assertShipmentTransition,
  canBookQuote,
  resolveFreightArranger,
} from '@singha/domain';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { LOGISTICS_PROVIDER, type LogisticsProvider } from './logistics.provider';

/** Freight quotes are valid for 24h (config-tunable later). A quote is never a booking. */
const QUOTE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Logistics read + quote service (Evolution E7, pack doc 10). Serves the Incoterm taxonomy and
 * configured logistics nodes, and produces deterministic instant freight estimates through the
 * swappable provider (fake until owner O6). A quote persists its assumptions, provider and expiry
 * and is NOT a booking (a booking references an accepted, still-fresh quote — E7b). Flag-gated by
 * `logistics`.
 */
@Injectable()
export class LogisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly uow: UnitOfWork,
    @Inject(LOGISTICS_PROVIDER) private readonly provider: LogisticsProvider,
  ) {}

  private requireFeature(): void {
    if (!this.config.get().features.logistics) {
      throw new NotFoundException('Logistics is not enabled');
    }
  }

  /** The Incoterm taxonomy (freight/insurance responsibility indicators). */
  incoterms() {
    this.requireFeature();
    return INCOTERMS;
  }

  /** Configured logistics nodes (ports / airports / depots / pickup sites). */
  async nodes() {
    this.requireFeature();
    return this.prisma.logisticsNode.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { code: true, name: true, kind: true, countryCode: true, city: true },
    });
  }

  /** Produce + persist a deterministic instant freight estimate (a quote, not a booking). */
  async requestQuote(input: QuoteRequest) {
    this.requireFeature();
    const [origin, destination] = await Promise.all([
      this.prisma.logisticsNode.findUnique({ where: { code: input.originNodeCode } }),
      this.prisma.logisticsNode.findUnique({ where: { code: input.destinationNodeCode } }),
    ]);
    if (!origin) throw new NotFoundException(`Origin node not found: ${input.originNodeCode}`);
    if (!destination) {
      throw new NotFoundException(`Destination node not found: ${input.destinationNodeCode}`);
    }

    const incoterm = INCOTERMS.find((i) => i.code === input.incoterm)!;
    const freightArranger = resolveFreightArranger(incoterm, input.freightArranger);
    const quote = await this.provider.quote({
      originCountry: origin.countryCode,
      destinationCountry: destination.countryCode,
      transportMode: input.transportMode,
      chargeableUnits: input.chargeableUnits,
    });

    const quotedAt = new Date();
    const expiresAt = new Date(quotedAt.getTime() + QUOTE_TTL_SECONDS * 1000);
    const id = newId();
    const row = await this.prisma.logisticsQuote.create({
      data: {
        id,
        originNodeCode: input.originNodeCode,
        destinationNodeCode: input.destinationNodeCode,
        transportMode: input.transportMode,
        incoterm: input.incoterm,
        freightArranger,
        chargeableUnits: input.chargeableUnits,
        amountMinor: quote.amountMinor,
        currency: input.currency,
        provider: quote.provider,
        assumptions: quote.assumptions as unknown as Prisma.InputJsonValue,
        status: 'QUOTED',
        quotedAt,
        expiresAt,
      },
    });
    return this.view(row);
  }

  /** Read a persisted quote. */
  async getQuote(id: string) {
    this.requireFeature();
    const row = await this.prisma.logisticsQuote.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Quote not found');
    return this.view(row);
  }

  /**
   * Book an accepted, still-fresh quote (E7b). Atomic under a quote row lock: a quote can be
   * booked at most once (UNIQUE booking per quote + the lock), an expired or already-accepted
   * quote is rejected, and the quote's terms are SNAPSHOTTED onto the booking (a quote is not a
   * booking). Creates the booking, an initial shipment (BOOKED) and its first timeline event.
   */
  async bookQuote(principal: Principal, quoteId: string) {
    this.requireFeature();
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.$queryRawUnsafe(
        'SELECT id FROM logistics_quote WHERE id = $1 FOR UPDATE',
        quoteId,
      );
      const quote = await ctx.tx.logisticsQuote.findUnique({ where: { id: quoteId } });
      if (!quote) throw new NotFoundException('Quote not found');
      if (!canBookQuote(quote.status, quote.expiresAt, new Date())) {
        throw new ConflictException(
          quote.status === 'ACCEPTED' ? 'Quote already booked' : 'Quote is not bookable (expired)',
        );
      }
      const existing = await ctx.tx.logisticsBooking.findUnique({ where: { quoteId } });
      if (existing) throw new ConflictException('Quote already booked');

      const bookingId = newId();
      const shipmentId = newId();
      await ctx.tx.logisticsBooking.create({
        data: {
          id: bookingId,
          quoteId,
          originNodeCode: quote.originNodeCode,
          destinationNodeCode: quote.destinationNodeCode,
          transportMode: quote.transportMode,
          incoterm: quote.incoterm,
          freightArranger: quote.freightArranger,
          amountMinor: quote.amountMinor,
          currency: quote.currency,
          provider: quote.provider,
          bookedByCustomerId: principal.customerId ?? undefined,
        },
      });
      await ctx.tx.logisticsQuote.update({ where: { id: quoteId }, data: { status: 'ACCEPTED' } });
      await ctx.tx.logisticsShipment.create({
        data: { id: shipmentId, bookingId, status: 'BOOKED' },
      });
      await ctx.tx.logisticsShipmentEvent.create({
        data: {
          id: newId(),
          shipmentId,
          type: 'BOOKED',
          status: 'BOOKED',
          note: 'Booking confirmed',
        },
      });
      ctx.audit({
        action: 'LOGISTICS_QUOTE_BOOKED',
        targetType: 'LogisticsBooking',
        targetId: bookingId,
        after: { quoteId, shipmentId, amountMinor: Number(quote.amountMinor) },
      });
      return {
        bookingId,
        shipmentId,
        quoteId,
        status: 'BOOKED',
        amountMinor: Number(quote.amountMinor),
        currency: quote.currency,
        freightArranger: quote.freightArranger,
      };
    });
  }

  /** A shipment + its append-only event timeline. Owner-of-the-booking or staff only. */
  async getShipment(principal: Principal, id: string) {
    this.requireFeature();
    const shipment = await this.prisma.logisticsShipment.findUnique({
      where: { id },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
        booking: { select: { bookedByCustomerId: true } },
      },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    // Object-level authz: a shipment timeline (notes, locations, dates) is visible only to the
    // customer who booked it, or to staff. exchange:participate alone (every customer) is not
    // sufficient — this used to expose any buyer's delivery timeline to any participant.
    const actor = toActor(principal);
    if (actor.type !== 'staff' && shipment.booking.bookedByCustomerId !== principal.customerId) {
      throw new ForbiddenException('Not permitted to view this shipment');
    }
    return {
      id: shipment.id,
      bookingId: shipment.bookingId,
      status: shipment.status,
      events: shipment.events.map((e) => ({
        type: e.type,
        status: e.status,
        note: e.note,
        locationCode: e.locationCode,
        occurredAt: e.occurredAt.toISOString(),
      })),
    };
  }

  /**
   * Append an event to a shipment's timeline (E7b). When the event carries a `status` it advances
   * the shipment, validated against the pure lifecycle state machine; otherwise it is a note.
   */
  async appendShipmentEvent(principal: Principal, shipmentId: string, input: ShipmentEventInput) {
    this.requireFeature();
    const shipment = await this.prisma.logisticsShipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (input.status) {
      assertShipmentTransition(shipment.status as ShipmentStatus, input.status);
    }
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.logisticsShipmentEvent.create({
        data: {
          id: newId(),
          shipmentId,
          type: input.type,
          status: input.status,
          note: input.note,
          locationCode: input.locationCode,
        },
      });
      const updated = input.status
        ? await ctx.tx.logisticsShipment.update({
            where: { id: shipmentId },
            data: { status: input.status },
          })
        : shipment;
      ctx.audit({
        action: 'LOGISTICS_SHIPMENT_EVENT',
        targetType: 'LogisticsShipment',
        targetId: shipmentId,
        after: { type: input.type, status: input.status ?? shipment.status },
      });
      return { shipmentId, status: updated.status, type: input.type };
    });
  }

  private view(q: {
    id: string;
    status: string;
    originNodeCode: string;
    destinationNodeCode: string;
    transportMode: string;
    incoterm: string;
    freightArranger: string;
    chargeableUnits: number;
    amountMinor: bigint;
    currency: string;
    provider: string;
    assumptions: unknown;
    quotedAt: Date;
    expiresAt: Date;
  }) {
    return {
      id: q.id,
      status: q.status,
      originNodeCode: q.originNodeCode,
      destinationNodeCode: q.destinationNodeCode,
      transportMode: q.transportMode,
      incoterm: q.incoterm,
      freightArranger: q.freightArranger,
      chargeableUnits: q.chargeableUnits,
      amountMinor: Number(q.amountMinor),
      currency: q.currency,
      provider: q.provider,
      assumptions: q.assumptions ?? {},
      quotedAt: q.quotedAt.toISOString(),
      expiresAt: q.expiresAt.toISOString(),
    };
  }
}
