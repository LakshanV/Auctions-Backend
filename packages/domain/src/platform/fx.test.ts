import { describe, expect, it } from 'vitest';
import {
  applyMarginBps,
  buildRateSnapshot,
  convertMinor,
  isRateFresh,
  parseRateToScaled,
} from './fx';

describe('FX rate parsing (float-free — DECISIONS D5)', () => {
  it('parses decimal rates to a 10^9-scaled integer', () => {
    expect(parseRateToScaled('300')).toBe(300_000_000_000n);
    expect(parseRateToScaled('0.0033')).toBe(3_300_000n);
    expect(parseRateToScaled('1.000000001')).toBe(1_000_000_001n);
  });

  it('rejects malformed, zero and over-precise rates', () => {
    expect(() => parseRateToScaled('abc')).toThrow();
    expect(() => parseRateToScaled('-1')).toThrow();
    expect(() => parseRateToScaled('0')).toThrow();
    expect(() => parseRateToScaled('1.1234567891')).toThrow(); // > 9 dp
  });
});

describe('convertMinor (exact bigint, half-up rounding)', () => {
  const rate = (s: string) => parseRateToScaled(s);

  it('converts $100.00 → LKR at 1 USD = 300 LKR', () => {
    expect(
      convertMinor({
        amountMinor: 10_000n, // $100.00
        baseMinorExponent: 2,
        quoteMinorExponent: 2,
        rateScaled: rate('300'),
      }),
    ).toBe(3_000_000n); // 30,000.00 LKR
  });

  it('round-trips LKR → USD (rounding recovers the original)', () => {
    expect(
      convertMinor({
        amountMinor: 3_000_000n, // 30,000.00 LKR
        baseMinorExponent: 2,
        quoteMinorExponent: 2,
        rateScaled: rate('0.003333333'), // ≈ 1/300
      }),
    ).toBe(10_000n); // $100.00
  });

  it('handles a zero-decimal quote currency (JPY, exponent 0)', () => {
    // $10.00 × 150 JPY/USD = ¥1500 (0 minor digits).
    expect(
      convertMinor({
        amountMinor: 1_000n,
        baseMinorExponent: 2,
        quoteMinorExponent: 0,
        rateScaled: rate('150'),
      }),
    ).toBe(1_500n);
  });

  it('rounds half-up on the final minor unit', () => {
    // 1 minor (=$0.01) × 2.5 = 2.5 minor → half-up → 3.
    expect(
      convertMinor({
        amountMinor: 1n,
        baseMinorExponent: 2,
        quoteMinorExponent: 2,
        rateScaled: rate('2.5'),
      }),
    ).toBe(3n);
  });

  it('applies a spread margin (bps) that reduces the received amount', () => {
    const base = convertMinor({
      amountMinor: 10_000n,
      baseMinorExponent: 2,
      quoteMinorExponent: 2,
      rateScaled: rate('300'),
    });
    const withMargin = convertMinor({
      amountMinor: 10_000n,
      baseMinorExponent: 2,
      quoteMinorExponent: 2,
      rateScaled: rate('300'),
      marginBps: 100, // 1%
    });
    expect(base).toBe(3_000_000n);
    expect(withMargin).toBe(2_970_000n); // 1% haircut
  });

  it('rejects a negative amount or non-positive rate', () => {
    expect(() =>
      convertMinor({
        amountMinor: -1n,
        baseMinorExponent: 2,
        quoteMinorExponent: 2,
        rateScaled: rate('1'),
      }),
    ).toThrow();
    expect(() =>
      convertMinor({
        amountMinor: 1n,
        baseMinorExponent: 2,
        quoteMinorExponent: 2,
        rateScaled: 0n,
      }),
    ).toThrow();
  });
});

describe('margin + freshness', () => {
  it('applyMarginBps: 0 leaves the rate unchanged, 100 bps trims 1%', () => {
    expect(applyMarginBps(300_000_000_000n, 0)).toBe(300_000_000_000n);
    expect(applyMarginBps(300_000_000_000n, 100)).toBe(297_000_000_000n);
    expect(() => applyMarginBps(1n, 20_000)).toThrow();
  });

  it('isRateFresh is true strictly before expiry', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(isRateFresh(new Date('2026-01-01T00:01:00Z'), now)).toBe(true);
    expect(isRateFresh(new Date('2025-12-31T23:59:00Z'), now)).toBe(false);
  });

  it('buildRateSnapshot computes expiry from ttl and validates the rate', () => {
    const quotedAt = new Date('2026-01-01T00:00:00Z');
    const snap = buildRateSnapshot({
      base: 'USD',
      quote: 'LKR',
      rate: '300',
      provider: 'fake',
      quotedAt,
      ttlSeconds: 300,
    });
    expect(snap.expiresAt.toISOString()).toBe('2026-01-01T00:05:00.000Z');
    expect(snap.marginBps).toBe(0);
    expect(() =>
      buildRateSnapshot({
        base: 'USD',
        quote: 'LKR',
        rate: 'not-a-rate',
        provider: 'fake',
        quotedAt,
        ttlSeconds: 300,
      }),
    ).toThrow();
    expect(() =>
      buildRateSnapshot({
        base: 'USD',
        quote: 'LKR',
        rate: '300',
        provider: 'fake',
        quotedAt,
        ttlSeconds: 0,
      }),
    ).toThrow();
  });
});
