import { type SignedUpload, type StorageProvider } from './storage.provider';

/** Fallback when no storage is configured — callers should check `configured`. */
export class UnconfiguredStorageProvider implements StorageProvider {
  readonly configured = false;

  createSignedUploadUrl(): Promise<SignedUpload> {
    return Promise.reject(new Error('Storage provider is not configured'));
  }

  getSignedDownloadUrl(): Promise<string> {
    return Promise.reject(new Error('Storage provider is not configured'));
  }
}
