import { Module } from '@nestjs/common';
import { AuctionModule } from '../auction/auction.module';
import { ConnectController } from './connect.controller';
import { ConnectService } from './connect.service';
import { CHANNEL_PROVIDER, MockChannelProvider } from './channel.provider';
import { VOICE_PROVIDER, MockVoiceProvider } from './voice.provider';

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
  providers: [
    ConnectService,
    { provide: CHANNEL_PROVIDER, useClass: MockChannelProvider },
    // RW9 — voice/telephony seam (future voice, docs/09). Mock until a carrier is configured
    // (PROVIDER_GATED PRV-2); swap the binding, nothing else changes.
    { provide: VOICE_PROVIDER, useClass: MockVoiceProvider },
  ],
  exports: [CHANNEL_PROVIDER, VOICE_PROVIDER],
})
export class ConnectModule {}
