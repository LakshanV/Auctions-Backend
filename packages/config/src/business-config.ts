/**
 * Business configuration (docs/20). These are Class C values (product-owner
 * approval). We ship SAFE PLACEHOLDER defaults so implementation is never
 * blocked, and expose which keys still require sign-off before go-live.
 */
export interface BusinessConfig {
  buyerPremiumPct: number;
  sellerCommissionPct: number;
  taxPct: number;
  paymentDeadlineHours: number;
  collectionDeadlineDays: number;
}

/** Keys that MUST be confirmed by the product owner before production. */
export const BUSINESS_APPROVAL_REQUIRED: readonly (keyof BusinessConfig)[] = [
  'buyerPremiumPct',
  'sellerCommissionPct',
  'taxPct',
  'paymentDeadlineHours',
  'collectionDeadlineDays',
] as const;
