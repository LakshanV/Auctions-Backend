import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard + Control Centre module (Evolution E11b). Flag-gated in the service; the projection
 * shaping lives in the pure `@singha/domain` engine. AppConfigService + PrismaService are global.
 */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
