import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import exifr from 'exifr';
import { dHash, exposureStats, isPerceptualDuplicate, laplacianVariance } from '@singha/domain';

export interface ImageQualityReport {
  blurVariance: number;
  sharp: boolean;
  meanBrightness: number;
  tooDark: boolean;
  glare: boolean;
}
export interface ImageMetadata {
  make?: string;
  model?: string;
  takenAt?: string;
  orientation?: number;
  width?: number;
  height?: number;
  hasGps: boolean;
}

export const DETERMINISTIC_IMAGE = Symbol('DETERMINISTIC_IMAGE');

/**
 * Real, local, deterministic image analysis (directive §13). OSS only — sharp (Apache-2.0; libvips
 * LGPL, dynamically linked) for decode/resize, exifr (MIT) for metadata — feeding the pure
 * `@singha/domain` primitives. No model, no weights, no external call, no per-call cost, best
 * privacy. This is the engine the PROVIDER_GATED VLM sits ABOVE: deterministic tasks (blur/quality,
 * perceptual hashing / duplicate detection, EXIF) never need a cloud key.
 */
@Injectable()
export class DeterministicImageProvider {
  readonly name = 'oss-deterministic';

  /** Blur + exposure assessment (the capture-coach primary signal). */
  async assessQuality(image: Buffer): Promise<ImageQualityReport> {
    const { data, info } = await sharp(image)
      .grayscale()
      .resize(256, 256, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const variance = laplacianVariance(data, info.width, info.height);
    const ex = exposureStats(data);
    return {
      blurVariance: variance,
      sharp: variance >= 100,
      meanBrightness: ex.mean,
      tooDark: ex.clippedDark > 0.5 || ex.mean < 40,
      glare: ex.clippedBright > 0.15,
    };
  }

  /** 64-bit dHash for near-duplicate detection (relisting / fraud review — advisory only). */
  async perceptualHash(image: Buffer): Promise<string> {
    const { data } = await sharp(image)
      .grayscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return dHash(data);
  }

  /** EXIF + intrinsic metadata (camera, capture time, orientation, dimensions, GPS presence). */
  async extractMetadata(image: Buffer): Promise<ImageMetadata> {
    const meta = await sharp(image).metadata();
    let exif: Record<string, unknown> | null = null;
    try {
      exif = (await exifr.parse(image, { gps: true })) as Record<string, unknown> | null;
    } catch {
      /* no/!unreadable EXIF — non-fatal */
    }
    const dto = exif?.DateTimeOriginal;
    return {
      make: typeof exif?.Make === 'string' ? exif.Make : undefined,
      model: typeof exif?.Model === 'string' ? exif.Model : undefined,
      takenAt: dto instanceof Date ? dto.toISOString() : undefined,
      orientation: meta.orientation,
      width: meta.width,
      height: meta.height,
      hasGps: exif?.latitude != null && exif?.longitude != null,
    };
  }

  isDuplicate(hashA: string, hashB: string, threshold = 10): boolean {
    return isPerceptualDuplicate(hashA, hashB, threshold);
  }
}
