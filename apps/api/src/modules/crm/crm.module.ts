import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmCustomerService } from './crm-customer.service';

/**
 * Singha CRM (staff operations) module — internal notes + tasks/follow-ups + the staff Customer
 * 360 projections (history / unified timeline / CRM strip). PrismaService + UnitOfWork are global;
 * CrmService and CrmCustomerService are exported so the member/360 view can fold a customer's
 * channel identities, open tasks and recent notes into the staff Member 360.
 */
@Module({
  controllers: [CrmController],
  providers: [CrmService, CrmCustomerService],
  exports: [CrmService, CrmCustomerService],
})
export class CrmModule {}
