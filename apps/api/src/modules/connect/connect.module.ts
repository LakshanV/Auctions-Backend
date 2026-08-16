import { Module } from '@nestjs/common';
import { AuctionModule } from '../auction/auction.module';
import { ConnectController } from './connect.controller';
import { ConnectService } from './connect.service';
import { CHANNEL_PROVIDER, MockChannelProvider } from './channel.provider';

/**
 * Singha Connect. The channel provider is bound to the mock adapter until real
 * WhatsApp/Meta/SMS credentials are supplied — swap the binding, nothing else.
 *
 * `CHANNEL_PROVIDER` is exported (AIC-2) so `AssistantModule` can reuse the SAME binding for its
 * WhatsApp channel-request ack — never a second/parallel provider instance (constraint 3).
 */
@Module({
  imports: [AuctionModule],
  controllers: [ConnectController],
  providers: [ConnectService, { provide: CHANNEL_PROVIDER, useClass: MockChannelProvider }],
  exports: [CHANNEL_PROVIDER],
})
export class ConnectModule {}
