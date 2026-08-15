import { Module } from '@nestjs/common';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';
import { FX_PROVIDER, FakeFxProvider, GoogleFxProvider } from './fx.provider';
import { AppConfigService } from '../../config/config.service';

/**
 * Currency + FX module (Evolution E5). The provider is chosen at startup: the Google adapter when
 * `FX_API_URL` is configured (owner action O5, DECISIONS D12), otherwise the deterministic,
 * credential-free fake — swap by configuring the endpoint, nothing else changes. AppConfigService
 * and PrismaService are global.
 */
@Module({
  controllers: [FxController],
  providers: [
    FxService,
    {
      provide: FX_PROVIDER,
      useFactory: (config: AppConfigService) => {
        const fx = config.get().fx;
        return fx.configured ? new GoogleFxProvider(fx.apiUrl, fx.apiKey) : new FakeFxProvider();
      },
      inject: [AppConfigService],
    },
  ],
  exports: [FxService],
})
export class FxModule {}
