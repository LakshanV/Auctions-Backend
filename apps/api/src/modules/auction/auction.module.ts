import { Module } from '@nestjs/common';
import { AuctionController } from './auction.controller';
import { AuctionService } from './auction.service';
import { AuctionRealtimeGateway } from './auction-realtime.gateway';

@Module({
  controllers: [AuctionController],
  providers: [AuctionService, AuctionRealtimeGateway],
  exports: [AuctionService],
})
export class AuctionModule {}
