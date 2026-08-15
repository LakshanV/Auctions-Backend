import { Module } from '@nestjs/common';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';

/**
 * Transaction Routing module (Evolution E6). Flag-gated in the service. AppConfigService and
 * PrismaService are global; the resolution logic lives in the pure `@singha/domain` engine.
 */
@Module({
  controllers: [RoutingController],
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
