import { z } from 'zod';

/**
 * Singha ID contracts (Evolution E11, pack doc 11 §Singha ID). One geography-neutral identity
 * extends the existing Customer — no country-specific accounts. Verification is **capability-based**:
 * a member browses broadly, and verifies more only when an activity requires it. The specific
 * KYC/licence *evidence* required per activity/market is owner-gated (register O7); the engine +
 * gating ship now with safe placeholder requirements.
 */

/** The capabilities a member can hold. `browse`-class activities need none; the rest are gated. */
export const singhaCapabilities = [
  'place_bid',
  'make_offer',
  'sell',
  'operate_auction',
  'export',
  'import',
  'high_value_trade',
] as const;
export type SinghaCapability = (typeof singhaCapabilities)[number];

export const capabilityStatuses = ['pending', 'verified', 'expired', 'rejected'] as const;
export type CapabilityStatus = (typeof capabilityStatuses)[number];

/** Update the member's preferences (all optional; a partial patch). */
export const updateSinghaProfileSchema = z.object({
  countryResidency: z.string().optional(),
  displayCurrency: z.string().length(3).optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  companyRoles: z.array(z.string()).optional(),
  notificationPrefs: z.record(z.string(), z.boolean()).optional(),
});
export type UpdateSinghaProfileInput = z.infer<typeof updateSinghaProfileSchema>;

/** A member requests a capability (starts/reopens a verification). */
export const requestCapabilitySchema = z.object({
  capability: z.enum(singhaCapabilities),
  evidenceRef: z.string().optional(),
});
export type RequestCapabilityInput = z.infer<typeof requestCapabilitySchema>;

/** An operator decides a pending capability (server-side authority; O7 governs the evidence bar). */
export const decideCapabilitySchema = z.object({
  customerId: z.string().min(1),
  capability: z.enum(singhaCapabilities),
  decision: z.enum(['verified', 'rejected']),
  expiresAt: z.string().datetime().optional(),
});
export type DecideCapabilityInput = z.infer<typeof decideCapabilitySchema>;
