/**
 * Member credit / bid-capacity engine (Revision 05) — PURE, deterministic core.
 *
 * All money is an exact BigInt count of minor units; the configurable security
 * ratio and eligibility factors are basis points (bps: 10000 = 100.00%). We NEVER
 * use floating point for authoritative financial calculations (Revision 05 §14).
 * Database orchestration (locking, reservation rows, audit) lives in the API; this
 * module owns the maths so it is exhaustively unit-testable and rebuildable.
 */

/** 10000 bps = 100.00%. A verified cash deposit is typically 10000 (factor 1.00). */
export const FULL_FACTOR_BPS = 10000;

/** Default required-security ratio: 5.00% (Revision 05 §14 "configurable 5% rule"). */
export const DEFAULT_REQUIRED_SECURITY_BPS = 500;

export interface EligibleSecurity {
  /** Face/instrument amount in minor units. */
  faceAmountMinor: bigint;
  /** Eligibility factor in bps (10000 = 1.00; a haircut lowers it). */
  eligibilityBps: number;
  /** Only VERIFIED/ACTIVE, non-expired instruments count toward new credit. */
  countsTowardCredit: boolean;
}

/** eligibleValue = faceAmount × factor. Pending/unverified/expired contribute 0. */
export function eligibleSecurityValueMinor(security: EligibleSecurity): bigint {
  if (!security.countsTowardCredit) return 0n;
  return (security.faceAmountMinor * BigInt(security.eligibilityBps)) / BigInt(FULL_FACTOR_BPS);
}

export function totalEligibleSecurityMinor(securities: readonly EligibleSecurity[]): bigint {
  return securities.reduce((sum, s) => sum + eligibleSecurityValueMinor(s), 0n);
}

/**
 * theoreticalLimit = eligibleSecurity × 10000 / requiredSecurityBps.
 * At 5% (500 bps): LKR 500,000 security → LKR 10,000,000. At 10% (1000 bps) → 5,000,000.
 */
export function theoreticalCreditLimitMinor(
  eligibleSecurityMinor: bigint,
  requiredSecurityBps: number,
): bigint {
  if (requiredSecurityBps <= 0) {
    throw new Error('requiredSecurityBps must be positive');
  }
  return (eligibleSecurityMinor * BigInt(FULL_FACTOR_BPS)) / BigInt(requiredSecurityBps);
}

export interface CreditCaps {
  /** Platform-wide maximum, if any. */
  globalCapMinor?: bigint | null;
  /** Per-customer maximum, if any. */
  customerCapMinor?: bigint | null;
  /** Event/category-scoped maximum, if any. */
  scopeCapMinor?: bigint | null;
}

function minBig(...values: (bigint | null | undefined)[]): bigint | null {
  let out: bigint | null = null;
  for (const v of values) {
    if (v == null) continue;
    out = out == null || v < out ? v : out;
  }
  return out;
}

/**
 * Calculated base limit from security, floored by any configured caps. This is the
 * policy result BEFORE a human approves/caps it (approvedLimit is stored separately
 * so overrides never overwrite the calculation — Revision 05 §14/§15).
 */
export function calculatedBaseLimitMinor(input: {
  eligibleSecurityMinor: bigint;
  requiredSecurityBps: number;
  caps?: CreditCaps;
}): bigint {
  const theoretical = theoreticalCreditLimitMinor(
    input.eligibleSecurityMinor,
    input.requiredSecurityBps,
  );
  const cap = minBig(
    input.caps?.globalCapMinor,
    input.caps?.customerCapMinor,
    input.caps?.scopeCapMinor,
  );
  return cap == null ? theoretical : minBig(theoretical, cap)!;
}

export interface CreditAvailabilityInput {
  approvedLimitMinor: bigint;
  temporaryUpliftMinor?: bigint;
  committedExposureMinor: bigint;
}

export interface CreditAvailability {
  effectiveApprovedLimitMinor: bigint;
  committedExposureMinor: bigint;
  /** approved + uplift − committed, never reported below 0. */
  availableMinor: bigint;
}

/** availableCredit = effectiveApprovedLimit − committedExposure (§16). */
export function computeCreditAvailability(input: CreditAvailabilityInput): CreditAvailability {
  const effective = input.approvedLimitMinor + (input.temporaryUpliftMinor ?? 0n);
  const raw = effective - input.committedExposureMinor;
  return {
    effectiveApprovedLimitMinor: effective,
    committedExposureMinor: input.committedExposureMinor,
    availableMinor: raw < 0n ? 0n : raw,
  };
}

/**
 * Would a new reservation of `amountMinor` fit within remaining capacity? Used by
 * the concurrency-safe exposure gate before accepting a bid (§16/§17). Exact and
 * side-effect free; the caller holds the row/advisory lock.
 */
export function fitsWithinCapacity(input: {
  approvedLimitMinor: bigint;
  temporaryUpliftMinor?: bigint;
  committedExposureMinor: bigint;
  requestedMinor: bigint;
}): boolean {
  const effective = input.approvedLimitMinor + (input.temporaryUpliftMinor ?? 0n);
  return input.committedExposureMinor + input.requestedMinor <= effective;
}
