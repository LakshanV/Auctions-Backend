import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AiModule } from '../ai/ai.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { ConnectModule } from '../connect/connect.module';

/**
 * AIC-1/AIC-2/AIC-3 — customer-facing AI conversation assistant, cross-channel continuity and
 * AI-assisted search. Extends existing infrastructure only: the shared AI_PROVIDER binding
 * (ai.module — never a second/parallel binding), the privacy-filtered public catalogue
 * (catalogue.module — AIC-3's `CatalogueV2Service.list()` is the SAME instance `CatalogueV2Controller`
 * calls, never a second one), and (AIC-2) ConnectModule's exported CHANNEL_PROVIDER — the
 * assistant's WhatsApp channel-request ack reuses the SAME MockChannelProvider binding
 * ConnectService sends through, never a second instance. No new persistence — Conversation/
 * Message (Singha Connect) and AiRun (Singha AI Core) already cover this shape; AIC-2/AIC-3
 * store everything in Message.payload (see AssistantService.channelRequest/search /
 * ConnectService's continuation branch).
 */
@Module({
  imports: [AiModule, CatalogueModule, ConnectModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
