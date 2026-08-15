import { Module } from '@nestjs/common';
import { PlatformConfigController } from './platform-config.controller';
import { PlatformConfigService } from './platform-config.service';

/**
 * Platform configuration module (Evolution E2). Exposes read-only, flag-gated config
 * surfaces. `AppConfigService` (global) and `PrismaService` (global) are injected; no
 * providers to bind beyond the service.
 */
@Module({
  controllers: [PlatformConfigController],
  providers: [PlatformConfigService],
  exports: [PlatformConfigService],
})
export class PlatformConfigModule {}
