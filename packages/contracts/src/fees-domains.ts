import { z } from 'zod';

/**
 * Fees / Tax / Rules-engine contracts (Evolution E8, pack doc 10). Versioned, configurable rules
 * compute a transaction's charge breakdown deterministically; each line records the applied rule
 * id/version/basis/amount so an old transaction stays **reproducible after rules change** (pack
 * §10). Money is integer minor units, computed float-free (D5/D6). Tax rule *values* are owner-
 * gated (register O3): an unverified rule yields a non-binding PREVIEW (MANUAL_REVIEW_REQUIRED),
 * never an automatic binding charge (D7).
 */

/** Charge components persisted separately (pack §10). */
export const chargeComponents = [
  'buyer_premium',
  'seller_commission',
  'platform_fee',
  'method_fee',
  'freight',
  'tax',
  'inspection',
  'certification',
  'documentation',
  'storage',
  'export_admin',
  'other',
] as const;
export type ChargeComponent = (typeof chargeComponents)[number];

/** Which side of the transaction a charge falls on. */
export const chargeSides = ['BUYER', 'SELLER'] as const;
export type ChargeSide = (typeof chargeSides)[number];

/** How a charge is computed. */
export const chargeBases = ['PERCENT', 'FIXED'] as const;
export type ChargeBasis = (typeof chargeBases)[number];

/** What a PERCENT charge is a percentage of. */
export const chargeAppliesTo = ['PRINCIPAL', 'BUYER_SUBTOTAL'] as const;
export type ChargeAppliesTo = (typeof chargeAppliesTo)[number];

export const feeRuleStatuses = ['RESOLVED', 'MANUAL_REVIEW_REQUIRED'] as const;
export type FeeRuleStatus = (typeof feeRuleStatuses)[number];

/** Request a charge breakdown for a transaction shape. */
export const computeChargesRequestSchema = z.object({
  principalMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  operatorCode: z.string().optional(),
  jurisdiction: z.string().optional(),
  category: z.string().optional(),
  saleMethodCode: z.string().optional(),
});
export type ComputeChargesRequest = z.infer<typeof computeChargesRequestSchema>;

/** One computed charge line — carries the applied rule so it can be reproduced later. */
export const chargeLineSchema = z.object({
  component: z.enum(chargeComponents),
  side: z.enum(chargeSides),
  basis: z.enum(chargeBases),
  amountMinor: z.number().int().nonnegative(),
  appliedRuleCode: z.string(),
  appliedRuleVersion: z.number().int(),
  /** The rule's rate (bps) or fixed amount at the time of computation (reproducibility). */
  rateBps: z.number().int().nullable(),
  fixedMinor: z.number().int().nullable(),
});
export type ChargeLine = z.infer<typeof chargeLineSchema>;

/** The full breakdown: buyer-side total, tax, and seller proceeds. */
export const chargesResultSchema = z.object({
  status: z.enum(feeRuleStatuses),
  currency: z.string().length(3),
  principalMinor: z.number().int().nonnegative(),
  lines: z.array(chargeLineSchema),
  buyerFeesMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
  buyerTotalMinor: z.number().int().nonnegative(),
  sellerCommissionMinor: z.number().int().nonnegative(),
  sellerProceedsMinor: z.number().int(),
  reason: z.string(),
});
export type ChargesResult = z.infer<typeof chargesResultSchema>;
