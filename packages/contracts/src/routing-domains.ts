import { z } from 'zod';

/**
 * Transaction Routing + two-layer Terms contracts (Evolution E6, pack doc 07). The Routing Engine
 * is deterministic, explainable and versioned (pack §07): given a transaction's shape it resolves
 * the transaction operator, payment route, terms version, required verification and disclosures —
 * or `MANUAL_REVIEW_REQUIRED` when no verified rule covers it (DECISIONS D7: Claude never invents
 * legal/operator config; unverified config is a non-binding preview). No country `if/else` forest:
 * resolution is a table-driven match over configured `RoutingRule` rows.
 */

export const routingStatuses = ['RESOLVED', 'MANUAL_REVIEW_REQUIRED'] as const;
export type RoutingStatus = (typeof routingStatuses)[number];

export const termsLayers = ['PLATFORM', 'TRANSACTION'] as const;
export type TermsLayer = (typeof termsLayers)[number];

/** Required-verification tokens a rule can demand of the parties before a route binds. */
export const verificationRequirements = ['KYC', 'LICENCE', 'AUCTION_REGISTRATION'] as const;
export type VerificationRequirement = (typeof verificationRequirements)[number];

/**
 * The transaction shape fed to the router. Every field except `saleMethodCode` is optional — a
 * missing field is a wildcard the rules may or may not constrain. `originNodeCode` carries the
 * Satellite Market Node attribution (Addendum A); binding state still lives centrally.
 */
export const routingInputSchema = z.object({
  saleMethodCode: z.string().min(1),
  category: z.string().optional(),
  marketCode: z.string().optional(),
  jurisdiction: z.string().optional(),
  operatorCode: z.string().optional(),
  originNodeCode: z.string().optional(),
  destinationCountry: z.string().optional(),
  currency: z.string().optional(),
  /** Whether the acting party has completed KYC (drives a KYC-required rule's gating). */
  kycVerified: z.boolean().optional(),
  /** Whether the acting party holds the required licence (drives a licence-required rule). */
  licenceHeld: z.boolean().optional(),
});
export type RoutingInput = z.infer<typeof routingInputSchema>;

/** The deterministic, explainable resolution. */
export const routingResolutionSchema = z.object({
  status: z.enum(routingStatuses),
  transactionOperatorCode: z.string().nullable(),
  paymentRouteCode: z.string().nullable(),
  termsCode: z.string().nullable(),
  disclosures: z.array(z.string()),
  requiredVerification: z.array(z.string()),
  matchedRuleCode: z.string().nullable(),
  matchedRuleVersion: z.number().int().nullable(),
  /** Human-readable summary of the decision (why RESOLVED / why MANUAL_REVIEW_REQUIRED). */
  reason: z.string(),
  /** Ordered explainability trace — which conditions matched, which gates fired. */
  trace: z.array(z.string()),
});
export type RoutingResolution = z.infer<typeof routingResolutionSchema>;

/** A resolved terms document reference (the legal wording itself stays owner-reviewed, D7). */
export const termsRefSchema = z.object({
  code: z.string(),
  version: z.number().int(),
  layer: z.enum(termsLayers),
  verification: z.string(),
  bodyRef: z.string().nullable(),
});
export type TermsRef = z.infer<typeof termsRefSchema>;

/** Two-layer terms resolution: the platform terms + the most-specific transaction terms. */
export const termsResolutionSchema = z.object({
  platform: termsRefSchema.nullable(),
  transaction: termsRefSchema.nullable(),
  /** RESOLVED only when both layers are present AND verified; else MANUAL_REVIEW_REQUIRED. */
  status: z.enum(routingStatuses),
  reason: z.string(),
});
export type TermsResolution = z.infer<typeof termsResolutionSchema>;
