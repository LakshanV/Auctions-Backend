import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AiModule } from '../ai/ai.module';
import { CatalogueModule } from '../catalogue/catalogue.module';

/**
 * AIC-1 — customer-facing AI conversation assistant. Extends existing infrastructure only: the
 * shared AI_PROVIDER binding (ai.module — never a second/parallel binding) and the
 * privacy-filtered public catalogue (catalogue.module). No new persistence — Conversation/
 * Message (Singha Connect) and AiRun (Singha AI Core) already cover this shape.
 */
@Module({
  imports: [AiModule, CatalogueModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
