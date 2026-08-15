import { Module } from '@nestjs/common';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { LOGISTICS_PROVIDER, FakeLogisticsProvider } from './logistics.provider';

/**
 * Logistics module (Evolution E7). Flag-gated in the service. The provider is bound to the
 * deterministic fake until a real carrier/aggregator is configured (owner O6) — swap the binding,
 * nothing else changes. AppConfigService + PrismaService are global.
 */
@Module({
  controllers: [LogisticsController],
  providers: [LogisticsService, { provide: LOGISTICS_PROVIDER, useClass: FakeLogisticsProvider }],
  exports: [LogisticsService],
})
export class LogisticsModule {}
