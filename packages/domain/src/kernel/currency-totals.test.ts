import { describe, expect, it } from 'vitest';
import { InvariantViolation } from './errors';
import { emptyMoneyByCurrency, isMultiCurrency, totalsByCurrency } from './currency-totals';

describe('totalsByCurrency', () => {
  it('keeps unlike currencies in separate buckets instead of one raw total', () => {
    const aggregate = totalsByCurrency([
      { currency: 'USD', amountMinor: 250_000 },
      { currency: 'LKR', amountMinor: 1_000_000 },
      { currency: 'USD', amountMinor: 100_000 },
    ]);
    expect(aggregate.byCurrency).toEqual([
      { currency: 'LKR', totalMinor: 1_000_000, count: 1 },
      { currency: 'USD', totalMinor: 350_000, count: 2 },
    ]);
    expect(aggregate.currencies).toEqual(['LKR', 'USD']);
    expect(aggregate.count).toBe(3);
    expect(isMultiCurrency(aggregate)).toBe(true);
  });

  it('never exposes a cross-currency scalar total', () => {
    const aggregate = totalsByCurrency([
      { currency: 'USD', amountMinor: 1 },
      { currency: 'AUD', amountMinor: 1 },
    ]);
    expect(Object.keys(aggregate).sort()).toEqual(['byCurrency', 'count', 'currencies']);
    // The two 1s are NOT summed to 2 — they are different money.
    expect(aggregate.byCurrency.map((t) => t.totalMinor)).toEqual([1, 1]);
  });

  it('is single-bucket (and not multi-currency) when everything shares a currency', () => {
    const aggregate = totalsByCurrency([
      { currency: 'lkr', amountMinor: 5n },
      { currency: 'LKR', amountMinor: 7n },
    ]);
    expect(aggregate.byCurrency).toEqual([{ currency: 'LKR', totalMinor: 12, count: 2 }]);
    expect(isMultiCurrency(aggregate)).toBe(false);
  });

  it('accepts bigint minor units (Prisma money columns)', () => {
    expect(totalsByCurrency([{ currency: 'EUR', amountMinor: 9_000_000_000n }]).byCurrency).toEqual(
      [{ currency: 'EUR', totalMinor: 9_000_000_000, count: 1 }],
    );
  });

  it('skips unpriced rows rather than counting them as zero money', () => {
    const aggregate = totalsByCurrency([
      { currency: 'USD', amountMinor: null },
      { currency: 'USD', amountMinor: undefined },
      { currency: 'USD', amountMinor: 10 },
    ]);
    expect(aggregate.byCurrency).toEqual([{ currency: 'USD', totalMinor: 10, count: 1 }]);
    expect(aggregate.count).toBe(1);
  });

  it('is empty for no rows', () => {
    expect(totalsByCurrency([])).toEqual(emptyMoneyByCurrency());
  });

  it('refuses a row with no valid ISO currency instead of guessing one', () => {
    expect(() => totalsByCurrency([{ currency: '', amountMinor: 1 }])).toThrow(InvariantViolation);
    expect(() => totalsByCurrency([{ currency: null, amountMinor: 1 }])).toThrow(
      InvariantViolation,
    );
    expect(() => totalsByCurrency([{ currency: 'DOLLARS', amountMinor: 1 }])).toThrow(
      InvariantViolation,
    );
  });

  it('refuses money that cannot be represented exactly', () => {
    expect(() => totalsByCurrency([{ currency: 'USD', amountMinor: 1.5 }])).toThrow(
      InvariantViolation,
    );
    expect(() => totalsByCurrency([{ currency: 'USD', amountMinor: 2n ** 70n }])).toThrow(
      InvariantViolation,
    );
  });
});
