import { InvariantViolation } from './errors';
import { Money } from './money';

/**
 * Currency-grouped money aggregation (docs/14 financial ledger, pack doc 06 §Currency).
 *
 * A reporting surface must NEVER add two amounts that are denominated in different contractual
 * currencies: "USD 10,000 + LKR 10,000 = 20,000" is not a number, it is a defect. Every aggregate
 * produced here is therefore a *set of per-currency totals* — there is deliberately no single
 * `totalMinor` field on {@link MoneyByCurrency} for a caller to render by accident.
 *
 * The arithmetic itself runs through {@link Money}, which rejects cross-currency `add`, so a bug in
 * the bucketing below fails loudly (InvariantViolation → 422) instead of emitting a wrong figure.
 * Converting between currencies for *display* is a separate, explicit, snapshotted concern (E5/D5)
 * and never happens in an aggregate — display currency must not mutate contractual currency.
 */

/** The total of every amount that shares one contractual currency. */
export interface CurrencyTotal {
  currency: string;
  totalMinor: number;
  count: number;
}

/**
 * A monetary aggregate, grouped by contractual currency. Intentionally carries no cross-currency
 * scalar: `byCurrency` is the only total, and `currencies` tells a UI how many columns to render.
 */
export interface MoneyByCurrency {
  byCurrency: CurrencyTotal[];
  currencies: string[];
  count: number;
}

/** A row carrying one contractual amount. `amountMinor` may be absent (nothing priced yet). */
export interface CurrencyAmountRow {
  currency: string | null | undefined;
  amountMinor: number | bigint | null | undefined;
}

/** An aggregate over no rows. Never a `0` scalar — an empty set has no currency to report in. */
export function emptyMoneyByCurrency(): MoneyByCurrency {
  return { byCurrency: [], currencies: [], count: 0 };
}

function normaliseCurrency(currency: string | null | undefined): string {
  const code = String(currency ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new InvariantViolation(
      `Aggregate row has no valid ISO currency, got ${String(currency)}`,
    );
  }
  return code;
}

function toMinorUnits(amount: number | bigint): number {
  const value = typeof amount === 'bigint' ? Number(amount) : amount;
  if (!Number.isSafeInteger(value)) {
    throw new InvariantViolation(`Money minor units are not a safe integer: ${String(amount)}`);
  }
  return value;
}

/**
 * Sum rows into one bucket per contractual currency, sorted by currency for a stable projection.
 * Rows with no amount are skipped entirely (they contribute neither total nor count) — an unpriced
 * proposal is not "zero money", it is absent money.
 */
export function totalsByCurrency(rows: readonly CurrencyAmountRow[]): MoneyByCurrency {
  const buckets = new Map<string, { money: Money; count: number }>();
  for (const row of rows) {
    if (row.amountMinor === null || row.amountMinor === undefined) continue;
    const currency = normaliseCurrency(row.currency);
    const money = Money.of(toMinorUnits(row.amountMinor), currency);
    const bucket = buckets.get(currency);
    // `Money.add` refuses a currency mismatch, so a mis-keyed bucket can never silently sum.
    if (bucket) buckets.set(currency, { money: bucket.money.add(money), count: bucket.count + 1 });
    else buckets.set(currency, { money, count: 1 });
  }
  const byCurrency = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([currency, bucket]) => ({
      currency,
      totalMinor: bucket.money.minorUnits,
      count: bucket.count,
    }));
  return {
    byCurrency,
    currencies: byCurrency.map((t) => t.currency),
    count: byCurrency.reduce((sum, t) => sum + t.count, 0),
  };
}

/** True when the aggregate spans more than one currency — a single headline figure is invalid. */
export function isMultiCurrency(aggregate: MoneyByCurrency): boolean {
  return aggregate.currencies.length > 1;
}
