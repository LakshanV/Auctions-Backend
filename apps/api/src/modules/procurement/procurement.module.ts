import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

/**
 * Procurement module (Evolution E9). Flag-gated in the service; selection logic lives in the pure
 * `@singha/domain` engine. AppConfigService + PrismaService + UnitOfWork are global.
 */
@Module({
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
