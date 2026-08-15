import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CURRENCY_MINOR_EXPONENT,
  type CurrencyCode,
  SUPPORTED_CURRENCIES,
  currencyCodeSchema,
  newId,
} from '@singha/contracts';
import {
  type FxRateSnapshotValue,
  buildRateSnapshot,
  convertMinor,
  isRateFresh,
  parseRateToScaled,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { FX_PROVIDER, type FxRateProvider } from './fx.provider';

type FxFeatureKey = 'multiCurrency' | 'fxDisplay';

/** Freshness window for a display rate. Config-tunable later; conservative default. */
const RATE_TTL_SECONDS = 300;

/**
 * Currency + FX read service (Evolution E5). Serves supported currencies and **informational**
 * display conversions. It NEVER mutates a binding transaction currency (DECISIONS D5) — every
 * conversion is flagged `binding: false`. Rates come from the swappable provider (fake until the
 * Google adapter is configured, D12), are snapshotted with a freshness window, and are cached in
 * the `FxRateSnapshot` table so repeated display reads reuse one quote until it goes stale.
 */
@Injectable()
export class FxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Inject(FX_PROVIDER) private readonly provider: FxRateProvider,
  ) {}

  private requireFeature(key: FxFeatureKey): void {
    if (!this.config.get().features[key]) {
      throw new NotFoundException('This currency surface is not enabled');
    }
  }

  private currency(code: string): CurrencyCode {
    const parsed = currencyCodeSchema.safeParse(code);
    if (!parsed.success) throw new BadRequestException(`Unsupported currency: ${code}`);
    return parsed.data;
  }

  /** Supported currencies + their minor-unit exponents (gated by `multiCurrency`). */
  currencies() {
    this.requireFeature('multiCurrency');
    return SUPPORTED_CURRENCIES;
  }

  /** An informational display rate snapshot for a pair (gated by `fxDisplay`). */
  async displayRate(baseRaw: string, quoteRaw: string) {
    this.requireFeature('fxDisplay');
    const base = this.currency(baseRaw);
    const quote = this.currency(quoteRaw);
    const snapshot = await this.freshSnapshot(base, quote);
    return { ...this.snapshotView(snapshot), binding: false as const, stale: false };
  }

  /**
   * Convert a minor-unit amount for DISPLAY only (gated by `fxDisplay`). Returns the converted
   * amount, the exact rate snapshot used, and `binding: false` — this is never the transaction
   * currency (D5). All math is float-free bigint (D6).
   */
  async convert(amountMinorRaw: number, baseRaw: string, quoteRaw: string) {
    this.requireFeature('fxDisplay');
    if (!Number.isInteger(amountMinorRaw) || amountMinorRaw < 0) {
      throw new BadRequestException('amountMinor must be a non-negative integer');
    }
    const base = this.currency(baseRaw);
    const quote = this.currency(quoteRaw);
    const snapshot = await this.freshSnapshot(base, quote);
    const convertedMinor = convertMinor({
      amountMinor: BigInt(amountMinorRaw),
      baseMinorExponent: CURRENCY_MINOR_EXPONENT[base] ?? 2,
      quoteMinorExponent: CURRENCY_MINOR_EXPONENT[quote] ?? 2,
      rateScaled: parseRateToScaled(snapshot.rate),
      marginBps: snapshot.marginBps,
    });
    return {
      base,
      quote,
      amountMinor: amountMinorRaw,
      convertedMinor: Number(convertedMinor),
      binding: false as const,
      stale: !isRateFresh(snapshot.expiresAt, new Date()),
      rate: this.snapshotView(snapshot),
    };
  }

  /** Reuse a fresh persisted snapshot for the pair, else fetch a new quote and persist it. */
  private async freshSnapshot(base: string, quote: string): Promise<FxRateSnapshotValue> {
    if (base === quote) {
      const now = new Date();
      return {
        base,
        quote,
        rate: '1',
        provider: this.provider.name,
        quotedAt: now,
        expiresAt: new Date(now.getTime() + RATE_TTL_SECONDS * 1000),
        marginBps: 0,
      };
    }
    const existing = await this.prisma.fxRateSnapshot.findFirst({
      where: { base, quote, provider: this.provider.name },
      orderBy: { quotedAt: 'desc' },
    });
    if (existing && isRateFresh(existing.expiresAt, new Date())) {
      return {
        base: existing.base,
        quote: existing.quote,
        rate: existing.rate,
        provider: existing.provider,
        quotedAt: existing.quotedAt,
        expiresAt: existing.expiresAt,
        marginBps: existing.marginBps,
      };
    }
    const quoteResult = await this.provider.getRate(base, quote);
    const snapshot = buildRateSnapshot({
      base: quoteResult.base,
      quote: quoteResult.quote,
      rate: quoteResult.rate,
      provider: quoteResult.provider,
      quotedAt: quoteResult.quotedAt,
      ttlSeconds: RATE_TTL_SECONDS,
    });
    await this.prisma.fxRateSnapshot.create({
      data: {
        id: newId(),
        base: snapshot.base,
        quote: snapshot.quote,
        rate: snapshot.rate,
        provider: snapshot.provider,
        quotedAt: snapshot.quotedAt,
        expiresAt: snapshot.expiresAt,
        marginBps: snapshot.marginBps,
      },
    });
    return snapshot;
  }

  private snapshotView(s: FxRateSnapshotValue) {
    return {
      base: s.base,
      quote: s.quote,
      rate: s.rate,
      provider: s.provider,
      quotedAt: s.quotedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      marginBps: s.marginBps,
    };
  }
}
