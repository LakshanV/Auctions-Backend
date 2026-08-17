import { Module } from '@nestjs/common';
import { VisionController } from './vision.controller';
import { VisionService } from './vision.service';
import { VISION_PROVIDER, MockVisionProvider } from './vision.provider';
import { IntelligenceModule } from '../intelligence/intelligence.module';

/**
 * RW2 — Singha AI Core photo-first seller intake. The vision engine is bound to a deterministic
 * mock until a real OSS/managed provider is configured (PROVIDER_GATED) — swap the binding, nothing
 * else changes. Reuses Asset Intelligence for evidence-based valuation.
 */
@Module({
  imports: [IntelligenceModule],
  controllers: [VisionController],
  providers: [VisionService, { provide: VISION_PROVIDER, useClass: MockVisionProvider }],
})
export class VisionModule {}
