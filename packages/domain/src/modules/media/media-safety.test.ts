import { describe, expect, it } from 'vitest';
import {
  MEDIA_UPLOAD_POLICY,
  MALWARE_TEST_SIGNATURE,
  checkUploadAllowed,
  kindRequiresMalwareScan,
  normalizeMime,
  screenStorageKeyForMalware,
} from './media-safety';

describe('upload policy', () => {
  it('allows a known image type within the cap', () => {
    expect(
      checkUploadAllowed({ kind: 'image', mimeType: 'image/jpeg', sizeBytes: 1_000 }).allowed,
    ).toBe(true);
  });

  it('allows a PDF document but not an executable', () => {
    expect(checkUploadAllowed({ kind: 'document', mimeType: 'application/pdf' }).allowed).toBe(
      true,
    );
    const exe = checkUploadAllowed({ kind: 'document', mimeType: 'application/x-msdownload' });
    expect(exe.allowed).toBe(false);
    expect(exe.code).toBe('unsupported_type');
  });

  it('rejects a video content type on a document, and vice-versa', () => {
    expect(checkUploadAllowed({ kind: 'document', mimeType: 'video/mp4' }).allowed).toBe(false);
    expect(checkUploadAllowed({ kind: 'video', mimeType: 'application/pdf' }).allowed).toBe(false);
  });

  it('enforces the per-kind size cap', () => {
    const over = checkUploadAllowed({
      kind: 'image',
      mimeType: 'image/png',
      sizeBytes: MEDIA_UPLOAD_POLICY.image.maxBytes + 1,
    });
    expect(over.allowed).toBe(false);
    expect(over.code).toBe('too_large');
    const at = checkUploadAllowed({
      kind: 'image',
      mimeType: 'image/png',
      sizeBytes: MEDIA_UPLOAD_POLICY.image.maxBytes,
    });
    expect(at.allowed).toBe(true);
  });

  it('normalises MIME parameters and casing before matching', () => {
    expect(normalizeMime('IMAGE/JPEG; charset=binary')).toBe('image/jpeg');
    expect(checkUploadAllowed({ kind: 'image', mimeType: 'Image/JPEG; q=1' }).allowed).toBe(true);
  });

  it('treats an absent MIME as not-yet-disqualified (re-checked at registration), size still applies', () => {
    expect(checkUploadAllowed({ kind: 'document' }).allowed).toBe(true);
    expect(
      checkUploadAllowed({ kind: 'document', sizeBytes: MEDIA_UPLOAD_POLICY.document.maxBytes + 1 })
        .allowed,
    ).toBe(false);
  });
});

describe('malware scan gating', () => {
  it('requires a scan for documents and video, not for images', () => {
    expect(kindRequiresMalwareScan('document')).toBe(true);
    expect(kindRequiresMalwareScan('video')).toBe(true);
    expect(kindRequiresMalwareScan('image')).toBe(false);
    expect(kindRequiresMalwareScan('video_thumbnail')).toBe(false);
  });

  it('flags an EICAR/malware-test marked object as infected, everything else clean', () => {
    const bad = screenStorageKeyForMalware('assets/a1/eicar-sample.pdf');
    expect(bad.status).toBe('infected');
    expect(bad.signature).toBe(MALWARE_TEST_SIGNATURE);
    expect(screenStorageKeyForMalware('assets/a1/malware_test.mp4').status).toBe('infected');
    expect(screenStorageKeyForMalware('assets/a1/deed-scan.pdf').status).toBe('clean');
  });
});
