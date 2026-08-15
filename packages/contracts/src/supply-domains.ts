import { z } from 'zod';

/**
 * Supply Programmes + perishable-goods contracts (Evolution E10, pack doc 09 §Supply Programme +
 * owner reqs 23/24). The recurring-availability side — "I HAVE SOMETHING TO SELL, repeatedly": a
 * commodity supplier posts standing availability once instead of re-listing. Matching against buyer
 * demand is a **recommendation only** and never auto-awards (pack §09; consistent with DECISIONS
 * D4). Perishable metadata carries the agricultural/food specialist fields and drives automatic
 * expiry where appropriate.
 */

const decimalString = z.string().regex(/^\d+(\.\d{1,9})?$/, 'must be a non-negative decimal');
const signedDecimalString = z
  .string()
  .regex(/^-?\d+(\.\d{1,3})?$/, 'must be a decimal (may be negative)');

/** How often the supplier can supply. */
export const supplyFrequencies = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'on_demand',
] as const;
export type SupplyFrequency = (typeof supplyFrequencies)[number];

export const supplyProgrammeStatuses = [
  'draft',
  'active',
  'paused',
  'expired',
  'withdrawn',
] as const;
export type SupplyProgrammeStatus = (typeof supplyProgrammeStatuses)[number];

/** How a programme's indicative price is expressed. */
export const supplyPricingBases = ['total_lot', 'per_unit'] as const;
export type SupplyPricingBasis = (typeof supplyPricingBases)[number];

/** Create a recurring supply programme (draft). Quantities are decimal strings (never a float, D5);
 *  money is integer minor units. */
export const createSupplyProgrammeSchema = z.object({
  product: z.string().min(1),
  category: z.string().optional(),
  originCountry: z.string().optional(),
  availableQuantity: decimalString.optional(),
  quantityUnitCode: z.string().optional(),
  frequency: z.enum(supplyFrequencies).optional(),
  minOrderQuantity: decimalString.optional(),
  maxOrderQuantity: decimalString.optional(),
  pricingBasis: z.enum(supplyPricingBases).optional(),
  indicativePriceMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3),
  packing: z.string().optional(),
  quality: z.string().optional(),
  incoterm: z.string().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  operatorCode: z.string().optional(),
});
export type CreateSupplyProgrammeInput = z.infer<typeof createSupplyProgrammeSchema>;

/** Move a programme through its lifecycle (owner-only, transition-validated in the domain). */
export const setSupplyProgrammeStatusSchema = z.object({
  status: z.enum(['active', 'paused', 'expired', 'withdrawn']),
});
export type SetSupplyProgrammeStatusInput = z.infer<typeof setSupplyProgrammeStatusSchema>;

/** Buyer-side matching query: find offerable programmes that could satisfy a demand. The result is
 *  advisory — a recommendation, never a binding award (pack §09 / D4). */
export const recommendSupplySchema = z.object({
  category: z.string().optional(),
  product: z.string().optional(),
  quantityRequired: decimalString.optional(),
  quantityUnitCode: z.string().optional(),
  originCountry: z.string().optional(),
});
export type RecommendSupplyInput = z.infer<typeof recommendSupplySchema>;

/** The subjects perishable metadata can attach to (additive — never mutates the Listing table). */
export const perishableSubjectTypes = ['listing', 'supply_programme'] as const;
export type PerishableSubjectType = (typeof perishableSubjectTypes)[number];

/** Specialist agricultural/food metadata (owner req 24). Temperatures may be negative; moisture is a
 *  percentage 0–100. Dates drive automatic expiry (`expiryDate` / `shipmentWindowEnd`). */
export const perishableMetadataSchema = z.object({
  harvestDate: z.string().datetime().optional(),
  packingDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime().optional(),
  variety: z.string().optional(),
  grade: z.string().optional(),
  size: z.string().optional(),
  moisturePercent: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/, 'must be a percentage 0–100')
    .optional(),
  qualitySpec: z.string().optional(),
  coldChain: z.boolean().optional(),
  tempMinC: signedDecimalString.optional(),
  tempMaxC: signedDecimalString.optional(),
  phytosanitaryCert: z.boolean().optional(),
  originCert: z.boolean().optional(),
  availableQuantity: decimalString.optional(),
  minQuantity: decimalString.optional(),
  shipmentWindowStart: z.string().datetime().optional(),
  shipmentWindowEnd: z.string().datetime().optional(),
});
export type PerishableMetadataInput = z.infer<typeof perishableMetadataSchema>;

/** Attach (upsert) perishable metadata to a subject the caller owns. */
export const attachPerishableSchema = z.object({
  subjectType: z.enum(perishableSubjectTypes),
  subjectId: z.string().min(1),
  metadata: perishableMetadataSchema,
});
export type AttachPerishableInput = z.infer<typeof attachPerishableSchema>;
