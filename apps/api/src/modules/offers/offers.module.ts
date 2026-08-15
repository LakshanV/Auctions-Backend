import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { MemberModule } from '../member/member.module';

/**
 * Commercial Offer Engine V2 module (Evolution E4). Flag-gated in the service. Imports
 * MemberModule for CreditExposureService so a bound offer enforces the same bid-capacity gate
 * as auctions/Buy Now (§11). AppConfigService + PrismaService + UnitOfWork are global.
 */
@Module({
  imports: [MemberModule],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
