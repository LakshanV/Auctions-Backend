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

/**
 * Platform launch currency (pack 01 doc 09 — currency rules). Singha launches
 * LKR-only, so cross-lot totals (e.g. the dashboard "payment due" strip) are
 * summed in this single currency. This is made EXPLICIT rather than hard-coded at
 * the call site: if multi-currency is introduced later, totals must be separated
 * per currency or converted through an explicit rate source — never summed
 * across currencies as if interchangeable.
 */
export const PLATFORM_CURRENCY = 'LKR' as const;

/** Keys that MUST be confirmed by the product owner before production. */
export const BUSINESS_APPROVAL_REQUIRED: readonly (keyof BusinessConfig)[] = [
  'buyerPremiumPct',
  'sellerCommissionPct',
  'taxPct',
  'paymentDeadlineHours',
  'collectionDeadlineDays',
] as const;
