import { z } from 'zod';

/**
 * Singha Intelligence expansion contracts (Evolution E12, pack doc 12 §AI). These drive
 * **deterministic** server-side intelligence — matching, offer/pricing comparison and risk signals.
 * Every output is a **derived, non-binding recommendation** (rule 3: AI/derived outputs never
 * overwrite facts; rule 11 + doc 12: deterministic code, not an LLM, owns money/eligibility/state and
 * nothing here binds a transaction).
 */

export const insightKinds = ['MATCH', 'OFFER_COMPARISON', 'PRICE_COMPARABLES', 'RISK'] as const;
export type InsightKind = (typeof insightKinds)[number];

const decimalString = z.string().regex(/^\d+(\.\d{1,9})?$/, 'must be a non-negative decimal');

/** Buyer→supply / supplier→demand matching criteria (a search over offerable programmes). */
export const matchCriteriaSchema = z.object({
  category: z.string().optional(),
  product: z.string().optional(),
  quantityRequired: decimalString.optional(),
  quantityUnitCode: z.string().optional(),
  originCountry: z.string().optional(),
});
export type MatchCriteriaInput = z.infer<typeof matchCriteriaSchema>;

/** Compare a set of complete commercial proposals (Offer Intelligence). */
export const compareProposalsSchema = z.object({
  proposals: z
    .array(
      z.object({
        id: z.string().min(1),
        totalPriceMinor: z.number().int().nonnegative().optional(),
        unitPriceMinor: z.number().int().nonnegative().optional(),
        quantity: decimalString.optional(),
        deliveryDays: z.number().int().nonnegative().optional(),
        incoterm: z.string().optional(),
      }),
    )
    .min(1),
});
export type CompareProposalsInput = z.infer<typeof compareProposalsSchema>;

/** Pricing Intelligence: comparables over observed programme prices for a category/product. */
export const priceComparablesSchema = z.object({
  category: z.string().optional(),
  product: z.string().optional(),
});
export type PriceComparablesInput = z.infer<typeof priceComparablesSchema>;

/** Fraud/Risk review signals (deterministic scoring, never an automatic block). */
export const riskSignalsSchema = z.object({
  accountAgeDays: z.number().int().nonnegative(),
  unverifiedHighValue: z.boolean().optional(),
  rapidActions: z.number().int().nonnegative().optional(),
  mismatchedCountry: z.boolean().optional(),
  chargebackHistory: z.boolean().optional(),
});
export type RiskSignalsInput = z.infer<typeof riskSignalsSchema>;
