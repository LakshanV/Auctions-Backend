/** Storage adapter (docs/06, docs/16 StorageProvider). Originals are immutable. */
export interface SignedUpload {
  path: string;
  token: string;
  signedUrl: string;
}

export interface StorageProvider {
  readonly configured: boolean;
  /** A grant for the client to upload directly to object storage (no app relay). */
  createSignedUploadUrl(path: string): Promise<SignedUpload>;
  /** A time-limited read URL for private media. */
  getSignedDownloadUrl(path: string, expiresInSec?: number): Promise<string>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
