import { Module } from '@nestjs/common';
import { AuctionModule } from '../auction/auction.module';
import { ConnectController } from './connect.controller';
import { ConnectService } from './connect.service';
import { CHANNEL_PROVIDER, MockChannelProvider } from './channel.provider';

/**
 * Singha Connect. The channel provider is bound to the mock adapter until real
 * WhatsApp/Meta/SMS credentials are supplied — swap the binding, nothing else.
 */
@Module({
  imports: [AuctionModule],
  controllers: [ConnectController],
  providers: [ConnectService, { provide: CHANNEL_PROVIDER, useClass: MockChannelProvider }],
})
export class ConnectModule {}
