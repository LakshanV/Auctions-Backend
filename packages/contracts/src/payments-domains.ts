import { z } from 'zod';

/**
 * Payment orchestration contracts (Evolution E8b, pack doc 10). ONE UX, operator-specific
 * **regulated** routes resolved deterministically from operator / currency / jurisdiction / method.
 * Singha never creates unlicensed internal banking or escrow — a route always references an EXTERNAL
 * regulated provider, and a route that is not owner-verified/licensed yields
 * `MANUAL_REVIEW_REQUIRED` (owner register O4, D7). Webhook intake is signed + idempotent.
 */

export const paymentRouteStatuses = ['RESOLVED', 'MANUAL_REVIEW_REQUIRED'] as const;
export type PaymentRouteStatus = (typeof paymentRouteStatuses)[number];

/** Provider kinds — all EXTERNAL/regulated. There is deliberately no internal-ledger/escrow kind. */
export const paymentProviderKinds = [
  'operator_bank_transfer',
  'operator_gateway',
  'external_escrow',
  'manual_offline',
] as const;
export type PaymentProviderKind = (typeof paymentProviderKinds)[number];

/** What the payment is for. */
export const paymentPurposes = ['buyer_settlement', 'seller_payout', 'deposit'] as const;
export type PaymentPurpose = (typeof paymentPurposes)[number];

/** Resolve a regulated payment route for a transaction shape. */
export const resolvePaymentRouteSchema = z.object({
  operatorCode: z.string().min(1),
  currency: z.string().length(3),
  jurisdiction: z.string().optional(),
  saleMethodCode: z.string().optional(),
  purpose: z.enum(paymentPurposes).default('buyer_settlement'),
  amountMinor: z.number().int().nonnegative().optional(),
});
export type ResolvePaymentRouteInput = z.infer<typeof resolvePaymentRouteSchema>;

/** The deterministic resolution — a route reference (never an internal ledger) or manual review. */
export const paymentRouteResolutionSchema = z.object({
  status: z.enum(paymentRouteStatuses),
  routeCode: z.string().nullable(),
  provider: z.string().nullable(),
  providerKind: z.enum(paymentProviderKinds).nullable(),
  /** A reference to owner-configured, off-platform settlement instructions (never invented). */
  instructionsRef: z.string().nullable(),
  requiresManualSettlement: z.boolean(),
  matchedRuleCode: z.string().nullable(),
  matchedRuleVersion: z.number().int().nullable(),
  reason: z.string(),
});
export type PaymentRouteResolution = z.infer<typeof paymentRouteResolutionSchema>;

/** Signed, idempotent webhook intake from an external provider. */
export const paymentWebhookSchema = z.object({
  provider: z.string().min(1),
  eventId: z.string().min(1),
  type: z.string().min(1),
  signature: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});
export type PaymentWebhookInput = z.infer<typeof paymentWebhookSchema>;
