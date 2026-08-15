import { IllegalTransition } from '../../kernel/errors';

/**
 * Singha ID capability engine (Evolution E11, pack doc 11 §Singha ID). PURE logic for
 * **capability-based verification**: a member browses/searches/watches freely, and an activity that
 * carries commercial or regulatory risk requires a *verified, unexpired* capability grant. The exact
 * evidence bar per activity/market is owner-gated (register O7) — this engine encodes the gating
 * shape and a safe default activity→capability map; the requirement *values* are supplied later.
 */

export const SINGHA_CAPABILITIES = [
  'place_bid',
  'make_offer',
  'sell',
  'operate_auction',
  'export',
  'import',
  'high_value_trade',
] as const;
export type SinghaCapability = (typeof SINGHA_CAPABILITIES)[number];

export const CAPABILITY_STATUSES = ['pending', 'verified', 'expired', 'rejected'] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

/** Activities that never require verification — the "browse broadly" surface. */
export const OPEN_ACTIVITIES = ['browse', 'search', 'watch', 'view_listing'] as const;

/**
 * The capability an activity requires, or null when it is open. Default (placeholder) map — an
 * activity name that matches a capability requires that capability; everything else is open. O7 may
 * later widen/narrow this per market.
 */
export function activityRequiresCapability(activity: string): SinghaCapability | null {
  if ((OPEN_ACTIVITIES as readonly string[]).includes(activity)) return null;
  return (SINGHA_CAPABILITIES as readonly string[]).includes(activity)
    ? (activity as SinghaCapability)
    : null;
}

export interface CapabilityGrant {
  capability: string;
  status: CapabilityStatus;
  expiresAt: Date | null;
}

/** Resolve a grant's effective status at `now` — a verified grant past its expiry reads as expired. */
export function effectiveCapabilityStatus(
  grant: CapabilityGrant | null,
  now: Date,
): CapabilityStatus | 'none' {
  if (!grant) return 'none';
  if (grant.status === 'verified' && grant.expiresAt && now > grant.expiresAt) return 'expired';
  return grant.status;
}

export interface CapabilityDecision {
  activity: string;
  requiredCapability: SinghaCapability | null;
  permitted: boolean;
  status: CapabilityStatus | 'none' | 'open';
  reason:
    | 'OPEN'
    | 'VERIFIED'
    | 'VERIFICATION_REQUIRED'
    | 'VERIFICATION_PENDING'
    | 'VERIFICATION_EXPIRED'
    | 'VERIFICATION_REJECTED';
}

/**
 * Decide whether a member may perform an activity given their (single, most-relevant) grant. Open
 * activities are always permitted. A gated activity needs a verified, unexpired grant; otherwise the
 * decision explains what is missing. This is an authorization *evaluation* — the enforcing engine
 * (auction/offer/commerce) still calls it before a binding action.
 */
export function evaluateCapability(
  activity: string,
  grant: CapabilityGrant | null,
  now: Date,
): CapabilityDecision {
  const requiredCapability = activityRequiresCapability(activity);
  if (requiredCapability === null) {
    return { activity, requiredCapability: null, permitted: true, status: 'open', reason: 'OPEN' };
  }
  const status = effectiveCapabilityStatus(grant, now);
  if (status === 'verified') {
    return { activity, requiredCapability, permitted: true, status, reason: 'VERIFIED' };
  }
  const reason =
    status === 'pending'
      ? 'VERIFICATION_PENDING'
      : status === 'expired'
        ? 'VERIFICATION_EXPIRED'
        : status === 'rejected'
          ? 'VERIFICATION_REJECTED'
          : 'VERIFICATION_REQUIRED';
  return { activity, requiredCapability, permitted: false, status, reason };
}

/** An operator may only decide a capability that is currently pending. */
export function assertCapabilityDecidable(current: CapabilityStatus): void {
  if (current !== 'pending') {
    throw new IllegalTransition(`capability is ${current}, not pending — cannot decide`);
  }
}
