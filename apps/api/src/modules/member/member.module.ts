import { Module } from '@nestjs/common';
import { MemberController } from './member.controller';
import { MemberSelfController } from './member-self.controller';
import { MemberService } from './member.service';
import { CreditExposureService } from './credit-exposure.service';
import { CrmModule } from '../crm/crm.module';

/**
 * Member identity, credit, security & performance engine (Revision 05). Exports
 * CreditExposureService so the auction engine can enforce bid capacity through a
 * narrow gate without importing the whole member surface. Imports CrmModule so the
 * staff Member 360 can fold in the CRM strip (channel identities + tasks + notes).
 */
@Module({
  imports: [CrmModule],
  controllers: [MemberController, MemberSelfController],
  providers: [MemberService, CreditExposureService],
  exports: [CreditExposureService, MemberService],
})
export class MemberModule {}
