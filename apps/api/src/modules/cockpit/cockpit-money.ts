import { CURRENCY_MINOR_EXPONENT } from '@singha/contracts';

/**
 * Precision-safe, currency-correct money aggregation for the Cockpit (multi-currency correction).
 *
 * Two hard rules:
 *  1. NEVER add minor units from different currencies. Every total is grouped by its authoritative
 *     transaction currency.
 *  2. Authoritative money is NEVER passed through `Number(BigInt)` — minor units stay `bigint`
 *     internally and serialize to a decimal STRING, so a large LKR amount can never lose precision.
 *
 * The minor-unit scale is the canonical ISO-4217 exponent from `@singha/contracts`
 * (`CURRENCY_MINOR_EXPONENT`) — there is no hard-coded `/100` anywhere.
 */

export function minorExponent(currency: string): number {
  return CURRENCY_MINOR_EXPONENT[currency.toUpperCase()] ?? 2;
}

/** One currency's grouped total: the authoritative minor amount as a string + its exponent. */
export interface MoneyAmount {
  currency: string;
  exponent: number;
  minor: string;
}

export function moneyAmount(currency: string, minor: bigint): MoneyAmount {
  return {
    currency: currency.toUpperCase(),
    exponent: minorExponent(currency),
    minor: minor.toString(),
  };
}

/**
 * Accumulates named minor-unit sums per currency (e.g. { total, overdue }), never crossing
 * currencies. Feed it (currency, { key: minorBigInt }) rows; read back one bucket per currency.
 */
export class CurrencyBuckets<K extends string> {
  private readonly buckets = new Map<string, Record<K, bigint>>();
  private readonly counts = new Map<string, Record<K, number>>();

  constructor(private readonly keys: readonly K[]) {}

  add(
    currency: string,
    values: Partial<Record<K, bigint>>,
    counts?: Partial<Record<K, number>>,
  ): void {
    const code = currency.toUpperCase();
    let sums = this.buckets.get(code);
    let cnts = this.counts.get(code);
    if (!sums) {
      sums = Object.fromEntries(this.keys.map((k) => [k, 0n])) as Record<K, bigint>;
      cnts = Object.fromEntries(this.keys.map((k) => [k, 0])) as Record<K, number>;
      this.buckets.set(code, sums);
      this.counts.set(code, cnts);
    }
    for (const k of this.keys) {
      const v = values[k];
      if (v !== undefined) sums[k] += v;
      const c = counts?.[k];
      if (c !== undefined) cnts![k] += c;
    }
  }

  /** One row per currency: exponent + each key's minor string + each key's count. */
  toRows(): Array<
    { currency: string; exponent: number } & Record<K, string> & Record<`${K}Count`, number>
  > {
    const rows: Array<Record<string, unknown>> = [];
    for (const [currency, sums] of this.buckets) {
      const cnts = this.counts.get(currency)!;
      const row: Record<string, unknown> = { currency, exponent: minorExponent(currency) };
      for (const k of this.keys) {
        row[k] = sums[k].toString();
        row[`${k}Count`] = cnts[k];
      }
      rows.push(row);
    }
    // Deterministic order: platform-ish first by code.
    rows.sort((a, b) => String(a.currency).localeCompare(String(b.currency)));
    return rows as Array<
      { currency: string; exponent: number } & Record<K, string> & Record<`${K}Count`, number>
    >;
  }
}
