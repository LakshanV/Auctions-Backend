import { describe, expect, it } from 'vitest';
import {
  type AuctionConfig,
  type BidderMaxEntry,
  applySoftClose,
  computeAuctionState,
  minimumAcceptableMax,
  reserveMet,
} from './engine';

/**
 * Randomized property tests for the PURE auction engine (directive: randomized state-machine /
 * property tests on critical logic). A seeded LCG PRNG makes every case deterministic and
 * reproducible (no Math.random, no external dependency) — the seeds below fully pin the run.
 *
 * The headline property is ORDER-INDEPENDENCE of computeAuctionState: the visible price and the
 * leader are invariant to the order the proxy maxima are presented in. That is the mathematical
 * reason concurrent bids resolve to one deterministic outcome (it underpins the row-locked engine
 * and the close/bid-race fix). The rest fuzz the proxy second-price bounds, the minimum-increment
 * rule, reserve monotonicity, and soft-close extend-only.
 */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function randomConfig(rng: () => number): AuctionConfig {
  const opening = int(rng, 1, 1_000_000);
  return {
    openingBidMinor: opening,
    incrementMinor: int(rng, 1, 100_000),
    reserveMinor: rng() < 0.5 ? null : int(rng, 0, opening + 5_000_000),
    softCloseTriggerSec: int(rng, 1, 120),
    softCloseExtendSec: int(rng, 1, 300),
    endsAt: new Date(1_700_000_000_000 + int(rng, 0, 1_000_000) * 1000),
  };
}
function randomMaxes(rng: () => number, config: AuctionConfig): BidderMaxEntry[] {
  const n = int(rng, 0, 8);
  const out: BidderMaxEntry[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      bidderId: `b${i}`,
      maxMinor: config.openingBidMinor + int(rng, 0, 10_000_000),
      // Distinct commit times so the (maxMinor, updatedAt) tie-break is a TOTAL order —
      // realistic (two bids never commit at the exact same instant on the locked row).
      updatedAt: new Date(1_700_000_000_000 + i),
    });
  }
  return out;
}
function shuffle<T>(rng: () => number, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

describe('computeAuctionState — randomized properties', () => {
  it('is ORDER-INDEPENDENT: price + leader invariant to arrival order (3000 cases)', () => {
    const rng = makeRng(0x5eed01);
    for (let c = 0; c < 3000; c += 1) {
      const config = randomConfig(rng);
      const maxes = randomMaxes(rng, config);
      const base = computeAuctionState(config, maxes);
      // Re-run on several shuffles — the authoritative outcome must not change.
      for (let k = 0; k < 3; k += 1) {
        const s = computeAuctionState(config, shuffle(rng, maxes));
        expect(s.currentBidMinor).toBe(base.currentBidMinor);
        expect(s.highBidderId).toBe(base.highBidderId);
        expect(s.reserveMet).toBe(base.reserveMet);
      }
    }
  });

  it('holds the proxy second-price bounds and picks the true leader (3000 cases)', () => {
    const rng = makeRng(0x5eed02);
    for (let c = 0; c < 3000; c += 1) {
      const config = randomConfig(rng);
      const maxes = randomMaxes(rng, config);
      const s = computeAuctionState(config, maxes);
      if (maxes.length === 0) {
        expect(s.highBidderId).toBeNull();
        expect(s.currentBidMinor).toBe(config.openingBidMinor);
        continue;
      }
      const sorted = [...maxes].sort(
        (a, b) => b.maxMinor - a.maxMinor || a.updatedAt.getTime() - b.updatedAt.getTime(),
      );
      const leader = sorted[0]!;
      // Leader is the highest max (earliest on a tie).
      expect(s.highBidderId).toBe(leader.bidderId);
      // Price is within [opening, leader.max] and never exceeds the leader's private max (cap).
      expect(s.currentBidMinor).toBeGreaterThanOrEqual(config.openingBidMinor);
      expect(s.currentBidMinor).toBeLessThanOrEqual(leader.maxMinor);
      if (sorted.length >= 2) {
        const expected = Math.max(
          config.openingBidMinor,
          Math.min(leader.maxMinor, sorted[1]!.maxMinor + config.incrementMinor),
        );
        expect(s.currentBidMinor).toBe(expected);
      } else {
        expect(s.currentBidMinor).toBe(config.openingBidMinor);
      }
      // reserveMet is exactly price >= reserve (or true when no reserve).
      expect(s.reserveMet).toBe(
        config.reserveMinor == null || s.currentBidMinor >= config.reserveMinor,
      );
    }
  });
});

describe('minimumAcceptableMax — randomized properties', () => {
  it('is always > current price (or the opening for the first bid) (2000 cases)', () => {
    const rng = makeRng(0x5eed03);
    for (let c = 0; c < 2000; c += 1) {
      const config = randomConfig(rng);
      expect(minimumAcceptableMax(config, null)).toBe(config.openingBidMinor);
      const current = int(rng, config.openingBidMinor, config.openingBidMinor + 5_000_000);
      const min = minimumAcceptableMax(config, current);
      expect(min).toBe(current + config.incrementMinor);
      expect(min).toBeGreaterThan(current); // strictly increasing — no same-price re-bid
    }
  });
});

describe('reserveMet — monotonic in price', () => {
  it('once met, stays met as the price rises (2000 cases)', () => {
    const rng = makeRng(0x5eed04);
    for (let c = 0; c < 2000; c += 1) {
      const reserve = rng() < 0.5 ? null : int(rng, 0, 5_000_000);
      const p = int(rng, 0, 5_000_000);
      const higher = p + int(rng, 0, 1_000_000);
      if (reserveMet(reserve, p)) expect(reserveMet(reserve, higher)).toBe(true);
    }
  });
});

describe('applySoftClose — extend-only', () => {
  it('never shortens the end time; extends only inside the window (3000 cases)', () => {
    const rng = makeRng(0x5eed05);
    for (let c = 0; c < 3000; c += 1) {
      const config = randomConfig(rng);
      // `now` anywhere from well before to just after the end.
      const now = new Date(
        config.endsAt.getTime() - int(rng, -60_000, config.softCloseTriggerSec * 1000 + 60_000),
      );
      const r = applySoftClose(config, now);
      // Invariant: the end time is NEVER moved earlier.
      expect(r.endsAt.getTime()).toBeGreaterThanOrEqual(config.endsAt.getTime());
      const triggerAt = config.endsAt.getTime() - config.softCloseTriggerSec * 1000;
      const insideWindow = now.getTime() >= triggerAt && now.getTime() < config.endsAt.getTime();
      if (!insideWindow) {
        expect(r.extended).toBe(false);
        expect(r.endsAt.getTime()).toBe(config.endsAt.getTime());
      }
      if (r.extended) {
        // A real extension pushes strictly past the original end.
        expect(r.endsAt.getTime()).toBeGreaterThan(config.endsAt.getTime());
        expect(r.endsAt.getTime()).toBe(now.getTime() + config.softCloseExtendSec * 1000);
      }
    }
  });
});
