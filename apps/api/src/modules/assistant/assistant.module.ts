import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AiModule } from '../ai/ai.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { ConnectModule } from '../connect/connect.module';

/**
 * AIC-1/AIC-2 — customer-facing AI conversation assistant + cross-channel continuity. Extends
 * existing infrastructure only: the shared AI_PROVIDER binding (ai.module — never a second/
 * parallel binding), the privacy-filtered public catalogue (catalogue.module), and (AIC-2)
 * ConnectModule's exported CHANNEL_PROVIDER — the assistant's WhatsApp channel-request ack
 * reuses the SAME MockChannelProvider binding ConnectService sends through, never a second
 * instance. No new persistence — Conversation/Message (Singha Connect) and AiRun (Singha AI
 * Core) already cover this shape; AIC-2 stores everything in Message.payload (see
 * AssistantService.channelRequest / ConnectService's continuation branch).
 */
@Module({
  imports: [AiModule, CatalogueModule, ConnectModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
