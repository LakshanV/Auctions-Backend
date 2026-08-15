import type { FreightArranger, IncotermDefinition, TransportMode } from '@singha/contracts';
import { IllegalTransition } from '../../kernel/errors';

/**
 * Logistics quote engine (Evolution E7, pack doc 10). PURE, deterministic, float-free (D5/D6): a
 * freight estimate is exact integer minor-unit math, freight responsibility derives from the
 * Incoterm (or an explicit override), and a quote is NOT a booking — it carries a freshness window.
 * Rates here are configurable PLACEHOLDERS (dev/test); live provider quotes arrive with the
 * logistics adapter (owner register O6).
 */

const BPS = 10_000n;

/** Positive-value integer division rounded half-up (no float). */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new IllegalTransition('denominator must be positive');
  return (2n * numerator + denominator) / (2n * denominator);
}

/**
 * PLACEHOLDER base freight rate (minor units per chargeable unit) by transport mode. Owner/provider
 * config replaces these; the shape (integer minor units) is what matters for D5.
 */
const BASE_RATE_PER_UNIT_MINOR: Record<TransportMode, bigint> = {
  RAIL: 250n,
  ROAD: 300n,
  SEA_FCL: 500n,
  SEA_LCL: 800n,
  RORO: 1_200n,
  BREAKBULK: 1_500n,
  COURIER: 2_000n,
  AIR: 3_500n,
};

/** Who arranges + pays freight: an explicit choice wins; otherwise the Incoterm decides. */
export function resolveFreightArranger(
  incoterm: Pick<IncotermDefinition, 'sellerBearsFreight'>,
  requested?: FreightArranger,
): FreightArranger {
  if (requested) return requested;
  return incoterm.sellerBearsFreight ? 'seller' : 'buyer';
}

/**
 * A deterministic zone multiplier (basis points) from origin/destination country. Same country =
 * 100%, cross-border = 250%, unknown = 150%. A stand-in for real distance/zone tables until a
 * provider supplies them — deterministic so the same leg always estimates identically.
 */
export function zoneMultiplierBps(
  originCountry: string | null,
  destinationCountry: string | null,
): number {
  if (!originCountry || !destinationCountry) return 15_000;
  return originCountry === destinationCountry ? 10_000 : 25_000;
}

/**
 * The freight estimate (integer minor units): base rate × chargeable units × zone multiplier,
 * evaluated in bigint with half-up rounding. Never a float (D5).
 */
export function estimateFreightMinor(input: {
  transportMode: TransportMode;
  chargeableUnits: number;
  zoneMultiplierBps: number;
}): bigint {
  const base = BASE_RATE_PER_UNIT_MINOR[input.transportMode];
  if (base == null) throw new IllegalTransition(`unknown transport mode: ${input.transportMode}`);
  if (!Number.isInteger(input.chargeableUnits) || input.chargeableUnits <= 0) {
    throw new IllegalTransition('chargeableUnits must be a positive integer');
  }
  if (input.zoneMultiplierBps <= 0)
    throw new IllegalTransition('zoneMultiplierBps must be positive');
  const numerator = base * BigInt(input.chargeableUnits) * BigInt(input.zoneMultiplierBps);
  return divRoundHalfUp(numerator, BPS);
}

/** A quote is fresh while `now` is strictly before `expiresAt`. */
export function isQuoteFresh(expiresAt: Date, now: Date): boolean {
  return now.getTime() < expiresAt.getTime();
}

/**
 * Whether a quote may be booked (E7b consumes this): only a still-fresh, not-yet-accepted quote.
 * A quote is never a booking — booking requires an explicit, in-window acceptance (pack §10).
 */
export function canBookQuote(status: string, expiresAt: Date, now: Date): boolean {
  if (status === 'ACCEPTED' || status === 'EXPIRED') return false;
  return isQuoteFresh(expiresAt, now);
}
