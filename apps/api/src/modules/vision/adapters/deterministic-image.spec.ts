import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { DeterministicImageProvider } from './deterministic-image.provider';

/**
 * §13/§14 evaluation of the REAL deterministic OSS adapter (sharp + exifr) on a synthetic corpus.
 * These are not mocks — sharp decodes/resizes actual encoded JPEGs and the pure primitives score
 * them. The corpus is generated deterministically so the benchmark is reproducible in CI.
 */
const P = new DeterministicImageProvider();

async function checkerboard(size = 256, cell = 16): Promise<Buffer> {
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 255 : 0;
      const i = (y * size + x) * 3;
      raw[i] = raw[i + 1] = raw[i + 2] = on;
    }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .jpeg()
    .toBuffer();
}
async function hGradient(dir: 'inc' | 'dec', size = 256): Promise<Buffer> {
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const t = x / (size - 1);
      const v = Math.round((dir === 'inc' ? t : 1 - t) * 255);
      const i = (y * size + x) * 3;
      raw[i] = raw[i + 1] = raw[i + 2] = v;
    }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .jpeg()
    .toBuffer();
}
const solid = (v: number, size = 256): Promise<Buffer> =>
  sharp({ create: { width: size, height: size, channels: 3, background: { r: v, g: v, b: v } } })
    .jpeg()
    .toBuffer();

describe('DeterministicImageProvider — real OSS image analysis (§13/§14)', () => {
  it('blur: a crisp checkerboard scores sharp; its blurred copy scores blurry', async () => {
    const crisp = await checkerboard();
    const blurred = await sharp(crisp).blur(8).jpeg().toBuffer();
    const a = await P.assessQuality(crisp);
    const b = await P.assessQuality(blurred);
    expect(a.sharp).toBe(true);
    expect(a.blurVariance).toBeGreaterThan(b.blurVariance);
    expect(b.sharp).toBe(false);
  });

  it('exposure: near-black → tooDark, near-white → glare, mid-grey → neither', async () => {
    expect((await P.assessQuality(await solid(2))).tooDark).toBe(true);
    expect((await P.assessQuality(await solid(253))).glare).toBe(true);
    const mid = await P.assessQuality(await solid(128));
    expect(mid.tooDark).toBe(false);
    expect(mid.glare).toBe(false);
  });

  it('perceptual hash + dedup: robust to recompression, distinguishes a different image', async () => {
    const inc = await hGradient('inc');
    const h1 = await P.perceptualHash(inc);
    const h2 = await P.perceptualHash(await sharp(inc).jpeg({ quality: 60 }).toBuffer());
    const hDec = await P.perceptualHash(await hGradient('dec'));
    expect(P.isDuplicate(h1, h2)).toBe(true); // same item, recompressed → duplicate
    expect(P.isDuplicate(h1, hDec)).toBe(false); // mirrored gradient → clearly different
  });

  it('metadata: intrinsic dimensions are extracted; GPS absent on a synthetic image', async () => {
    const meta = await P.extractMetadata(await checkerboard(320));
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(320);
    expect(meta.hasGps).toBe(false);
  });
});
