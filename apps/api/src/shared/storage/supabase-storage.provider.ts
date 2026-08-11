import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { type SignedUpload, type StorageProvider } from './storage.provider';

/**
 * Supabase Storage implementation. Uses the server-only key; never exposed.
 *
 * The Supabase client is created lazily on first use rather than in the
 * constructor: `createClient` eagerly initialises a RealtimeClient that needs a
 * native `WebSocket` (Node 22+). We only use Storage, so deferring construction
 * keeps app boot (and `/healthz`) independent of realtime/WebSocket support.
 */
export class SupabaseStorageProvider implements StorageProvider {
  readonly configured = true;
  private cached: SupabaseClient | undefined;

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}

  private get client(): SupabaseClient {
    if (!this.cached) {
      this.cached = createClient(this.url, this.serviceKey, {
        auth: { persistSession: false },
        realtime: { params: {} },
      });
    }
    return this.cached;
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
