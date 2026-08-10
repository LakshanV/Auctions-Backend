import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { type SignedUpload, type StorageProvider } from './storage.provider';

/** Supabase Storage implementation. Uses the server-only key; never exposed. */
export class SupabaseStorageProvider implements StorageProvider {
  readonly configured = true;
  private readonly client: SupabaseClient;

  constructor(
    url: string,
    serviceKey: string,
    private readonly bucket: string,
  ) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  async createSignedUploadUrl(path: string): Promise<SignedUpload> {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Supabase signed upload failed: ${error?.message}`);
    return { path: data.path, token: data.token, signedUrl: data.signedUrl };
  }

  async getSignedDownloadUrl(path: string, expiresInSec = 3600): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSec);
    if (error || !data) throw new Error(`Supabase signed URL failed: ${error?.message}`);
    return data.signedUrl;
  }
}
