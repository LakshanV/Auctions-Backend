import { Module } from '@nestjs/common';
import { MemberController } from './member.controller';
import { MemberSelfController } from './member-self.controller';
import { MemberService } from './member.service';
import { CreditExposureService } from './credit-exposure.service';

/**
 * Member identity, credit, security & performance engine (Revision 05). Exports
 * CreditExposureService so the auction engine can enforce bid capacity through a
 * narrow gate without importing the whole member surface.
 */
@Module({
  controllers: [MemberController, MemberSelfController],
  providers: [MemberService, CreditExposureService],
  exports: [CreditExposureService, MemberService],
})
export class MemberModule {}
