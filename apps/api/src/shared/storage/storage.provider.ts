/** Storage adapter (docs/06, docs/16 StorageProvider). Originals are immutable. */
export interface SignedUpload {
  path: string;
  token: string;
  signedUrl: string;
}

/** Verified metadata for a stored object (pack FIX-04 finalization). */
export interface StoredObject {
  exists: boolean;
  sizeBytes?: number;
  mimeType?: string;
}

export interface StorageProvider {
  readonly configured: boolean;
  /** A grant for the client to upload directly to object storage (no app relay). */
  createSignedUploadUrl(path: string): Promise<SignedUpload>;
  /** A time-limited read URL for private media. */
  getSignedDownloadUrl(path: string, expiresInSec?: number): Promise<string>;
  /**
   * Confirm an object actually exists at `path` (pack FIX-04). Registration must
   * never mark media ready for an object that was never uploaded. Returns
   * best-effort size/mime when the backend can read them.
   */
  statObject(path: string): Promise<StoredObject>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
