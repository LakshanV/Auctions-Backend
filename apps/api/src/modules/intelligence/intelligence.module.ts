import { Module } from '@nestjs/common';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';

@Module({
  controllers: [IntelligenceController],
  providers: [IntelligenceService],
  // Exported so the RW2 VisionModule can reuse comparables for evidence-based valuation.
  exports: [IntelligenceService],
})
export class IntelligenceModule {}
