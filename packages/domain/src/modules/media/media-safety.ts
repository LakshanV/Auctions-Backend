import type { MediaKind } from '@singha/contracts';

/**
 * RW3 — Secure media pipeline, PURE domain kernel (docs/06; pack FIX-03..07). No Nest, no storage,
 * no scanner — just the deterministic upload policy and the malware-screen decision, so both are
 * testable in isolation and identical on the API and in CI.
 *
 * Two jobs:
 *   1. Upload policy — a per-kind MIME allowlist + size cap. Non-image uploads (documents, video)
 *      are the risky class, so they are constrained to known-safe content types and bounded sizes.
 *   2. Malware-screen decision — the deterministic rule the credential-free mock scanner uses (and
 *      a fast pre-filter). A real scanner streams the object bytes to an isolated ClamAV daemon
 *      (SINGHA_OSS_DECISIONS.md — copyleft respected via the socket boundary); this rule is only
 *      the mock's decision + tests, never a claim of real detection.
 */

const MEGABYTE = 1024 * 1024;

export interface MediaKindPolicy {
  /** Lower-cased MIME types allowed for this kind (the bare type, parameters stripped). */
  mimeTypes: readonly string[];
  /** Hard upper bound on the object size in bytes. */
  maxBytes: number;
}

/**
 * Per-kind allowlist + size cap. Deliberately conservative — new formats are ADDED explicitly
 * rather than allowed by wildcard, so an unexpected content type is refused by default.
 */
export const MEDIA_UPLOAD_POLICY: Record<MediaKind, MediaKindPolicy> = {
  image: {
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/avif',
      'image/gif',
    ],
    maxBytes: 25 * MEGABYTE,
  },
  video: {
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxBytes: 512 * MEGABYTE,
  },
  document: {
    // Certificates/deeds/reports are PDFs or scanned images; nothing executable.
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 25 * MEGABYTE,
  },
  video_thumbnail: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 10 * MEGABYTE,
  },
};

/** Normalise a MIME header to its bare lower-cased type (`image/JPEG; q=1` → `image/jpeg`). */
export function normalizeMime(mimeType: string): string {
  return mimeType.split(';')[0]!.trim().toLowerCase();
}

export interface UploadCheck {
  allowed: boolean;
  code?: 'unsupported_type' | 'too_large';
  reason?: string;
}

/**
 * Decide whether an upload/registration is allowed. When `mimeType` is absent the type cannot be
 * judged yet (the caller re-checks against the storage-verified type at registration) — that is
 * treated as "not yet disqualified", never as a bypass. Size is checked whenever supplied.
 */
export function checkUploadAllowed(input: {
  kind: MediaKind;
  mimeType?: string | null;
  sizeBytes?: number | null;
}): UploadCheck {
  const policy = MEDIA_UPLOAD_POLICY[input.kind];
  if (!policy) {
    return {
      allowed: false,
      code: 'unsupported_type',
      reason: `unknown media kind "${input.kind}"`,
    };
  }
  if (input.mimeType) {
    const mt = normalizeMime(input.mimeType);
    if (!policy.mimeTypes.includes(mt)) {
      return {
        allowed: false,
        code: 'unsupported_type',
        reason: `content type "${mt}" is not allowed for ${input.kind}`,
      };
    }
  }
  if (input.sizeBytes != null && input.sizeBytes > policy.maxBytes) {
    return {
      allowed: false,
      code: 'too_large',
      reason: `size ${input.sizeBytes} exceeds the ${policy.maxBytes}-byte cap for ${input.kind}`,
    };
  }
  return { allowed: true };
}

/** True for the kinds that must pass a malware screen before being marked ready (docs/video). */
export function kindRequiresMalwareScan(kind: MediaKind): boolean {
  return kind === 'document' || kind === 'video';
}

export const MALWARE_TEST_SIGNATURE = 'EICAR-TEST-FILE';

export type MalwareStatus = 'clean' | 'infected' | 'skipped';

export interface MalwareDecision {
  status: MalwareStatus;
  signature?: string;
}

/**
 * The deterministic decision the mock scanner returns (and a fast pre-filter): an object whose key
 * carries the standard EICAR/`malware-test` marker is treated as infected, everything else clean.
 * This exists ONLY so the credential-free mock and the tests can prove the rejection gate — a real
 * scanner replaces the mock and streams the actual bytes to an isolated ClamAV daemon.
 */
export function screenStorageKeyForMalware(storageKey: string): MalwareDecision {
  return /eicar|malware[-_]?test/i.test(storageKey)
    ? { status: 'infected', signature: MALWARE_TEST_SIGNATURE }
    : { status: 'clean' };
}
