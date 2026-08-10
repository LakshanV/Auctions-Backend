import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { STORAGE_PROVIDER } from './storage.provider';
import { SupabaseStorageProvider } from './supabase-storage.provider';
import { UnconfiguredStorageProvider } from './unconfigured-storage.provider';

/** Binds STORAGE_PROVIDER to Supabase Storage when configured, else a no-op. */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const c = config.get();
        if (c.supabase.configured) {
          return new SupabaseStorageProvider(
            c.supabase.url,
            c.supabase.serviceKey,
            c.supabase.storageBucket,
          );
        }
        return new UnconfiguredStorageProvider();
      },
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
