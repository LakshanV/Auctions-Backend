/**
 * Deterministic, local image-analysis primitives (directive §13). These are REAL CPU
 * implementations — no model, no weights, no external call — operating on an 8-bit grayscale
 * plane so they are pure and trivially testable. The sharp-backed adapters in the API decode and
 * resize real uploaded images and feed these; swapping the decoder never changes this maths.
 *
 * Licence posture: the algorithms here are original/CC0. The API adapters use sharp (Apache-2.0;
 * libvips LGPL, dynamically linked) and exifr (MIT) — both commercially safe, verified in
 * SINGHA_OSS_DECISIONS.md.
 */

type Gray = Uint8Array | number[];

/** Blur metric: variance of the 3×3 Laplacian response. High = sharp/in-focus, low = blurry. */
export function laplacianVariance(gray: Gray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  const at = (x: number, y: number) => gray[y * width + x] as number;
  const resp: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      resp.push(4 * at(x, y) - at(x - 1, y) - at(x + 1, y) - at(x, y - 1) - at(x, y + 1));
    }
  }
  const mean = resp.reduce((a, b) => a + b, 0) / resp.length;
  return resp.reduce((a, b) => a + (b - mean) * (b - mean), 0) / resp.length;
}

/** Exposure: mean brightness + clipped-dark / clipped-bright fractions (under-exposure / glare). */
export function exposureStats(gray: Gray): {
  mean: number;
  clippedDark: number;
  clippedBright: number;
} {
  const n = gray.length || 1;
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const v = gray[i] as number;
    sum += v;
    if (v <= 8) dark += 1;
    if (v >= 247) bright += 1;
  }
  return { mean: sum / n, clippedDark: dark / n, clippedBright: bright / n };
}

/**
 * dHash over a 9×8 grayscale (72 samples) → a 64-bit perceptual hash as 16 hex chars. Each pixel is
 * compared to its right neighbour (8×8 = 64 comparisons), so the hash tracks gradient structure and
 * is robust to scale/compression — the standard basis for near-duplicate detection.
 */
export function dHash(gray9x8: Gray): string {
  let bits = 0n;
  let bit = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const left = gray9x8[row * 9 + col] as number;
      const right = gray9x8[row * 9 + col + 1] as number;
      if (left > right) bits |= 1n << bit;
      bit += 1n;
    }
  }
  return bits.toString(16).padStart(16, '0');
}

/** Hamming distance (bit differences) between two hex-encoded hashes. */
export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** Near-duplicate when the hashes are within `threshold` bits (default 10/64 ≈ 15%). */
export function isPerceptualDuplicate(a: string, b: string, threshold = 10): boolean {
  return hammingDistance(a, b) <= threshold;
}
