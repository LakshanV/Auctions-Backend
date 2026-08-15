import { IllegalTransition } from '../kernel/errors';

/**
 * FX conversion engine (Evolution E5, pack docs 09/10; DECISIONS D5 + D12). Pure, deterministic,
 * **float-free** money math (D6): a rate is an integer scaled by 10^9, amounts are integer minor
 * units, and conversion is exact bigint arithmetic with half-up rounding on the final minor unit.
 * A display conversion is ALWAYS informational — it never mutates a binding transaction currency;
 * binding calculations (E6/E8) consume a snapshotted rate, never a live lookup.
 */

/** Rates are represented as (rate × 10^9) in integer math. */
export const FX_RATE_SCALE = 9;
const FX_RATE_SCALE_FACTOR = 1_000_000_000n; // 10^9
const BPS_DENOMINATOR = 10_000n;

/** 10^n as a bigint (n small, non-negative). */
function pow10(n: number): bigint {
  if (n < 0) throw new IllegalTransition(`negative exponent: ${n}`);
  let result = 1n;
  for (let i = 0; i < n; i += 1) result *= 10n;
  return result;
}

/**
 * Parse a positive decimal rate string (up to 9 fractional digits) to a 10^9-scaled integer.
 * Throws on any malformed input so a bad rate can never silently corrupt a conversion.
 */
export function parseRateToScaled(rate: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,9}))?$/.exec(rate.trim());
  if (!m) throw new IllegalTransition(`invalid rate: "${rate}"`);
  const [, wholeGroup, fracGroup] = m;
  const whole = BigInt(wholeGroup ?? '0');
  const frac = fracGroup ? BigInt(fracGroup.padEnd(FX_RATE_SCALE, '0')) : 0n;
  const scaled = whole * FX_RATE_SCALE_FACTOR + frac;
  if (scaled <= 0n) throw new IllegalTransition('rate must be positive');
  return scaled;
}

/** Positive-value integer division rounded half-up. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new IllegalTransition('denominator must be positive');
  // (2n + d) / (2d) floors to the half-up result for non-negative n.
  return (2n * numerator + denominator) / (2n * denominator);
}

/**
 * Apply a spread margin (basis points) to a scaled rate — reduces the rate the counterparty
 * receives (a positive `marginBps` is a haircut). 0 bps (the display default) leaves it unchanged.
 */
export function applyMarginBps(rateScaled: bigint, marginBps: number): bigint {
  if (marginBps === 0) return rateScaled;
  if (marginBps < 0 || marginBps > 10_000) {
    throw new IllegalTransition(`marginBps out of range: ${marginBps}`);
  }
  return divRoundHalfUp(rateScaled * (BPS_DENOMINATOR - BigInt(marginBps)), BPS_DENOMINATOR);
}

/**
 * Convert an integer minor-unit amount from a base currency to a quote currency.
 *
 *   quoteMinor = amountMinor × rate × 10^quoteExp / 10^baseExp
 *
 * with `rate` supplied as a 10^9-scaled integer, evaluated entirely in bigint and rounded half-up
 * to the quote currency's minor unit. Never returns a fraction or touches a float (D5).
 */
export function convertMinor(input: {
  amountMinor: bigint;
  baseMinorExponent: number;
  quoteMinorExponent: number;
  rateScaled: bigint;
  marginBps?: number;
}): bigint {
  const { amountMinor, baseMinorExponent, quoteMinorExponent, rateScaled } = input;
  if (amountMinor < 0n) throw new IllegalTransition('amountMinor must be non-negative');
  if (rateScaled <= 0n) throw new IllegalTransition('rateScaled must be positive');
  const effectiveRate = applyMarginBps(rateScaled, input.marginBps ?? 0);
  const numerator = amountMinor * effectiveRate * pow10(quoteMinorExponent);
  const denominator = FX_RATE_SCALE_FACTOR * pow10(baseMinorExponent);
  return divRoundHalfUp(numerator, denominator);
}

/**
 * A rate is fresh while `now` is strictly before `expiresAt`. Staleness never blocks an
 * informational display (it is flagged, not fatal); a binding path (E6/E8) treats a stale rate as
 * unusable and re-quotes.
 */
export function isRateFresh(expiresAt: Date, now: Date): boolean {
  return now.getTime() < expiresAt.getTime();
}

/** An in-memory FX rate snapshot (the value that travels with a binding calc — D5). */
export interface FxRateSnapshotValue {
  base: string;
  quote: string;
  rate: string;
  provider: string;
  quotedAt: Date;
  expiresAt: Date;
  marginBps: number;
}

/** Build a snapshot with a freshness window (`ttlSeconds`) from a provider quote. */
export function buildRateSnapshot(input: {
  base: string;
  quote: string;
  rate: string;
  provider: string;
  quotedAt: Date;
  ttlSeconds: number;
  marginBps?: number;
}): FxRateSnapshotValue {
  // Validate the rate parses (throws on garbage) before it can be persisted or returned.
  parseRateToScaled(input.rate);
  if (input.ttlSeconds <= 0) throw new IllegalTransition('ttlSeconds must be positive');
  return {
    base: input.base,
    quote: input.quote,
    rate: input.rate,
    provider: input.provider,
    quotedAt: input.quotedAt,
    expiresAt: new Date(input.quotedAt.getTime() + input.ttlSeconds * 1000),
    marginBps: input.marginBps ?? 0,
  };
}
