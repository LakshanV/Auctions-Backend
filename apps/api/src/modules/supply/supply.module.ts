import { Module } from '@nestjs/common';
import { SupplyController } from './supply.controller';
import { SupplyService } from './supply.service';

/**
 * Supply Programmes + perishable-goods module (Evolution E10). Flag-gated in the service; the
 * lifecycle/matching/expiry logic lives in the pure `@singha/domain` engine. AppConfigService +
 * PrismaService + UnitOfWork are global.
 */
@Module({
  controllers: [SupplyController],
  providers: [SupplyService],
  exports: [SupplyService],
})
export class SupplyModule {}
