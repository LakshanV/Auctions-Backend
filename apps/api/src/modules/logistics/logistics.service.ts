import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { INCOTERMS, type QuoteRequest, newId } from '@singha/contracts';
import { resolveFreightArranger } from '@singha/domain';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
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
