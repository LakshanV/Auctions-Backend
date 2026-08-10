import { describe, expect, it } from 'vitest';
import { Money } from './money';
import { InvariantViolation } from './errors';

describe('Money', () => {
  it('adds and subtracts within the same currency', () => {
    const a = Money.of(150000, 'LKR');
    const b = Money.of(50000, 'LKR');
    expect(a.add(b).minorUnits).toBe(200000);
    expect(a.subtract(b).minorUnits).toBe(100000);
    expect(a.toString()).toBe('LKR 1500.00');
  });

  it('rejects floats and bad currency codes', () => {
    expect(() => Money.of(10.5, 'LKR')).toThrow(InvariantViolation);
    expect(() => Money.of(100, 'lkr')).toThrow(InvariantViolation);
  });

  it('refuses cross-currency arithmetic', () => {
    const lkr = Money.of(100, 'LKR');
    const usd = Money.of(100, 'USD');
    expect(() => lkr.add(usd)).toThrow(/Currency mismatch/);
  });
});
