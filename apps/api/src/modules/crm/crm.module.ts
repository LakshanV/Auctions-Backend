import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

/**
 * Singha CRM (staff operations) module — internal notes + tasks/follow-ups (CRM completion pass).
 * PrismaService + UnitOfWork are global; the service is exported so the member/360 projection can
 * fold a customer's open tasks + recent notes into the staff Customer 360.
 */
@Module({
  controllers: [CrmController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
