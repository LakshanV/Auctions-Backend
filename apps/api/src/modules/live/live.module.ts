import { Module } from '@nestjs/common';
import { AuctionModule } from '../auction/auction.module';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { LiveFloorController } from './live-floor.controller';
import { LiveFloorService } from './live-floor.service';
import { LIVE_PROVIDER, MockLiveStreamProvider } from './live.provider';

/**
 * Singha Live. Mock stream provider until IVS/YouTube access — swap binding only. RW6 adds the
 * auctioneer floor state-machine (LiveFloorService/Controller) over an AuctionEvent's ordered lots.
 */
@Module({
  imports: [AuctionModule],
  controllers: [LiveController, LiveFloorController],
  providers: [
    LiveService,
    LiveFloorService,
    { provide: LIVE_PROVIDER, useClass: MockLiveStreamProvider },
  ],
})
export class LiveModule {}
