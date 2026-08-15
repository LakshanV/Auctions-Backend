import { z } from 'zod';

/**
 * Currency + FX contracts (Evolution E5, pack docs 09/10; DECISIONS D5 + D12). Money stays in
 * integer minor units; a currency's minor-unit scale is its `minorExponent` (LKR/USD = 2, JPY = 0).
 * **Transaction currency is binding; display currency is informational** and never mutates the
 * contractual currency (D5). Any rate used in a binding calculation is snapshotted with
 * base/quote/rate/provider/quotedAt/expiry/margin. The FX source is Google (D12) behind a
 * swappable provider adapter; a credential-free fake supplies deterministic rates until the owner
 * confirms the endpoint, and no binding path depends on a live rate in E5.
 */

/** A supported currency and its ISO-4217 minor-unit exponent. */
export interface CurrencyDefinition {
  code: string;
  name: string;
  symbol: string;
  /** Number of minor-unit decimal places (2 = cents; 0 = none, e.g. JPY). */
  minorExponent: number;
}

/**
 * Supported currencies. Includes the owner's launch markets (Sri Lanka / Australia / India) plus
 * major settlement currencies. Additive: new codes may be appended without breaking anything.
 */
export const SUPPORTED_CURRENCIES: readonly CurrencyDefinition[] = [
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs', minorExponent: 2 },
  { code: 'USD', name: 'US Dollar', symbol: '$', minorExponent: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', minorExponent: 2 },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', minorExponent: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', minorExponent: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', minorExponent: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', minorExponent: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', minorExponent: 2 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', minorExponent: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', minorExponent: 0 },
] as const;

export const SUPPORTED_CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as [
  string,
  ...string[],
];

/** Minor-unit exponent by code (the canonical scale used by all conversion math). */
export const CURRENCY_MINOR_EXPONENT: Record<string, number> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c.minorExponent]),
);

/** A 3-letter, currently-supported currency code (uppercase). */
export const currencyCodeSchema = z
  .string()
  .length(3)
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(SUPPORTED_CURRENCY_CODES));
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

/** Decimal scale (10^9) all FX rates are represented at in integer math — never a float (D5). */
export const FX_RATE_SCALE = 9;

/** A positive decimal rate string with up to 9 fractional digits (quote units per 1 base unit). */
export const rateStringSchema = z
  .string()
  .regex(/^\d+(\.\d{1,9})?$/, 'rate must be a positive decimal with up to 9 fractional digits');

/**
 * An immutable FX rate snapshot — the record that travels with any binding calculation (D5). In
 * E5 it is returned by the informational display endpoints; E6/E8 embed it when a rate first
 * binds. `rate` is quote-currency units per 1 base-currency unit (major units).
 */
export const fxRateSnapshotSchema = z.object({
  base: currencyCodeSchema,
  quote: currencyCodeSchema,
  rate: rateStringSchema,
  provider: z.string().min(1),
  quotedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  marginBps: z.number().int().min(0).max(10_000).default(0),
});
export type FxRateSnapshot = z.infer<typeof fxRateSnapshotSchema>;

/** Request an informational conversion of a minor-unit amount between two supported currencies. */
export const fxConvertRequestSchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  base: currencyCodeSchema,
  quote: currencyCodeSchema,
});
export type FxConvertRequest = z.infer<typeof fxConvertRequestSchema>;

/**
 * The result of an informational conversion. `binding` is ALWAYS false — a display conversion
 * never becomes the transaction currency (D5). `stale` flags a rate past its freshness window.
 */
export const fxConvertResponseSchema = z.object({
  base: currencyCodeSchema,
  quote: currencyCodeSchema,
  amountMinor: z.number().int().nonnegative(),
  convertedMinor: z.number().int().nonnegative(),
  binding: z.literal(false),
  stale: z.boolean(),
  rate: fxRateSnapshotSchema,
});
export type FxConvertResponse = z.infer<typeof fxConvertResponseSchema>;
