import { Module } from '@nestjs/common';
import { ExchangeController } from './exchange.controller';
import { ExchangeService } from './exchange.service';
import { MemberModule } from '../member/member.module';

@Module({
  // MemberModule exports CreditExposureService so binding non-auction purchases
  // (Buy Now / accepted offer) enforce the same bid-capacity gate as auctions (§11).
  imports: [MemberModule],
  controllers: [ExchangeController],
  providers: [ExchangeService],
})
export class ExchangeModule {}
