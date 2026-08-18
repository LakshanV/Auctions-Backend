import { describe, expect, it } from 'vitest';
import {
  dHash,
  exposureStats,
  hammingDistance,
  isPerceptualDuplicate,
  laplacianVariance,
} from './deterministic';

describe('deterministic image primitives (§13)', () => {
  it('laplacianVariance: a flat image is ~0 (blurry), a high-contrast edge is large (sharp)', () => {
    const w = 16;
    const h = 16;
    const flat = new Uint8Array(w * h).fill(128);
    const edged = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) edged[y * w + x] = x < w / 2 ? 0 : 255;
    const flatVar = laplacianVariance(flat, w, h);
    const edgeVar = laplacianVariance(edged, w, h);
    expect(flatVar).toBeCloseTo(0, 5);
    expect(edgeVar).toBeGreaterThan(flatVar + 100);
  });

  it('exposureStats: detects clipped-dark, clipped-bright and mid exposure', () => {
    const n = 100;
    expect(exposureStats(new Uint8Array(n).fill(0)).clippedDark).toBe(1);
    expect(exposureStats(new Uint8Array(n).fill(255)).clippedBright).toBe(1);
    const mid = exposureStats(new Uint8Array(n).fill(128));
    expect(mid.clippedDark).toBe(0);
    expect(mid.clippedBright).toBe(0);
    expect(mid.mean).toBeCloseTo(128, 5);
  });

  it('dHash + hamming: identical images are duplicates; an inverted gradient is not', () => {
    // 9x8 left-to-right gradient (increasing) → every "left>right" is false → all-zero hash.
    const grad = new Uint8Array(9 * 8);
    for (let r = 0; r < 8; r += 1) for (let c = 0; c < 9; c += 1) grad[r * 9 + c] = c * 28;
    const inv = new Uint8Array(9 * 8);
    for (let r = 0; r < 8; r += 1) for (let c = 0; c < 9; c += 1) inv[r * 9 + c] = (8 - c) * 28;

    const a = dHash(grad);
    const b = dHash(grad);
    const c = dHash(inv);
    expect(hammingDistance(a, b)).toBe(0);
    expect(isPerceptualDuplicate(a, b)).toBe(true);
    expect(hammingDistance(a, c)).toBeGreaterThan(50); // opposite gradients differ on every bit
    expect(isPerceptualDuplicate(a, c)).toBe(false);
  });

  it('dHash: a small perturbation stays within the near-duplicate threshold', () => {
    const base = new Uint8Array(9 * 8);
    for (let i = 0; i < base.length; i += 1) base[i] = (i * 37) % 256;
    const noisy = Uint8Array.from(base, (v, i) => (i % 20 === 0 ? (v + 4) % 256 : v));
    expect(isPerceptualDuplicate(dHash(base), dHash(noisy), 10)).toBe(true);
  });
});
