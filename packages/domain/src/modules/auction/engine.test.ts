import { describe, expect, it } from 'vitest';
import {
  type AuctionConfig,
  type BidderMaxEntry,
  applySoftClose,
  computeAuctionState,
  minimumAcceptableMax,
} from './engine';

const cfg = (over: Partial<AuctionConfig> = {}): AuctionConfig => ({
  openingBidMinor: 100_000,
  incrementMinor: 10_000,
  reserveMinor: null,
  softCloseTriggerSec: 10,
  softCloseExtendSec: 20,
  endsAt: new Date('2026-01-01T00:00:00.000Z'),
  ...over,
});

const at = (bidderId: string, maxMinor: number, ms: number): BidderMaxEntry => ({
  bidderId,
  maxMinor,
  updatedAt: new Date(ms),
});

describe('computeAuctionState (proxy)', () => {
  it('a lone bidder sits at the opening bid, not their max', () => {
    const state = computeAuctionState(cfg(), [at('A', 500_000, 1)]);
    expect(state.currentBidMinor).toBe(100_000);
    expect(state.highBidderId).toBe('A');
  });

  it('price is second-highest max + one increment, capped at leader max', () => {
    const state = computeAuctionState(cfg(), [at('A', 500_000, 1), at('B', 300_000, 2)]);
    expect(state.highBidderId).toBe('A');
    expect(state.currentBidMinor).toBe(310_000); // 300k + 10k
  });

  it('a lower incoming max never takes the lead (proxy protects the leader)', () => {
    const state = computeAuctionState(cfg(), [at('A', 500_000, 1), at('B', 450_000, 2)]);
    expect(state.highBidderId).toBe('A');
    expect(state.currentBidMinor).toBe(460_000);
  });

  it('caps price at the leader max when the second max is very close', () => {
    const state = computeAuctionState(cfg(), [at('A', 505_000, 1), at('B', 500_000, 2)]);
    expect(state.highBidderId).toBe('A');
    expect(state.currentBidMinor).toBe(505_000); // 500k+10k capped at 505k
  });

  it('breaks equal-max ties in favour of the earliest bidder', () => {
    const state = computeAuctionState(cfg(), [at('A', 500_000, 2), at('B', 500_000, 1)]);
    expect(state.highBidderId).toBe('B');
  });

  it('reports reserve met only when the price reaches the reserve', () => {
    expect(
      computeAuctionState(cfg({ reserveMinor: 400_000 }), [at('A', 500_000, 1)]).reserveMet,
    ).toBe(false);
    expect(
      computeAuctionState(cfg({ reserveMinor: 250_000 }), [
        at('A', 500_000, 1),
        at('B', 300_000, 2),
      ]).reserveMet,
    ).toBe(true);
  });
});

describe('minimumAcceptableMax', () => {
  it('is the opening bid before any bids, then current + increment', () => {
    expect(minimumAcceptableMax(cfg(), null)).toBe(100_000);
    expect(minimumAcceptableMax(cfg(), 300_000)).toBe(310_000);
  });
});

describe('applySoftClose', () => {
  const base = cfg({ endsAt: new Date('2026-01-01T00:00:00.000Z') });

  it('extends when a bid lands inside the trigger window', () => {
    const now = new Date('2025-12-31T23:59:55.000Z'); // 5s before end, trigger 10s
    const result = applySoftClose(base, now);
    expect(result.extended).toBe(true);
    expect(result.endsAt).toEqual(new Date('2026-01-01T00:00:15.000Z')); // now + 20s
  });

  it('does not extend a bid comfortably before the window', () => {
    const now = new Date('2025-12-31T23:59:00.000Z'); // 60s before end
    expect(applySoftClose(base, now).extended).toBe(false);
  });
});
