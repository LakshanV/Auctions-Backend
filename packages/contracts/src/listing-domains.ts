import { z } from 'zod';

/**
 * Singha Evolution E3 — universal listing contracts (additive): configurable sale-method code,
 * quantity/unit, pricing basis and the structured-location roles. These describe the additive
 * `Listing` columns; existing consumers keep using the enum + flat location until they migrate.
 */

/** How a listing's price is expressed. */
export const pricingBases = ['total_lot', 'per_unit'] as const;
export type PricingBasis = (typeof pricingBases)[number];

/** The structured-location roles a listing can carry (pack doc 15). Distinct places — never
 *  assumed equal (asset ≠ seller ≠ pickup ≠ export origin ≠ destination). */
export const locationRoles = [
  'asset',
  'seller',
  'custodian',
  'pickup',
  'export_origin',
  'destination',
] as const;
export type LocationRole = (typeof locationRoles)[number];

/**
 * Optional commercial shape of a listing (additive). Decimal quantities travel as strings on
 * the wire — never a JS float (DECISIONS D5); the DB columns are `Decimal(38,9)`. Money stays
 * integer minor units.
 */
export const listingCommercialSchema = z.object({
  saleMethodCode: z.string().min(1).optional(),
  quantityAvailable: z.string().optional(),
  minOrderQuantity: z.string().optional(),
  quantityUnitCode: z.string().optional(),
  pricingBasis: z.enum(pricingBases).optional(),
  unitPriceMinor: z.number().int().nonnegative().optional(),
});
export type ListingCommercial = z.infer<typeof listingCommercialSchema>;
