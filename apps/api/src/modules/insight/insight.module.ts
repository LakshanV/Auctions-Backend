import { Module } from '@nestjs/common';
import { InsightController } from './insight.controller';
import { InsightService } from './insight.service';

/**
 * Singha Intelligence module (Evolution E12). Flag-gated in the service; all scoring/comparison/risk
 * logic lives in the pure, deterministic `@singha/domain` engine. AppConfigService + PrismaService
 * are global.
 */
@Module({
  controllers: [InsightController],
  providers: [InsightService],
  exports: [InsightService],
})
export class InsightModule {}
