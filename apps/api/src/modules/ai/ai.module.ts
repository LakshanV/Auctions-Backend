import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AI_PROVIDER, MockAiProvider } from './ai.provider';

/**
 * Singha AI Core. The provider is bound to the mock until a real text/vision
 * model is configured — swap the binding, nothing else changes.
 */
@Module({
  controllers: [AiController],
  providers: [AiService, { provide: AI_PROVIDER, useClass: MockAiProvider }],
})
export class AiModule {}
