import { Module } from '@nestjs/common';
import { AuctionModule } from '../auction/auction.module';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { LIVE_PROVIDER, MockLiveStreamProvider } from './live.provider';

/** Singha Live. Mock stream provider until IVS/YouTube access — swap binding only. */
@Module({
  imports: [AuctionModule],
  controllers: [LiveController],
  providers: [LiveService, { provide: LIVE_PROVIDER, useClass: MockLiveStreamProvider }],
})
export class LiveModule {}
