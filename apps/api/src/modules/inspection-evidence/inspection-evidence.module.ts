import { Module } from '@nestjs/common';
import { InspectionEvidenceController } from './inspection-evidence.controller';
import { InspectionEvidenceService } from './inspection-evidence.service';

/**
 * §20 (RW9) — inspection / certification evidence. PrismaService, UnitOfWork and the
 * INSPECTION_PROVIDER seam are all global, so nothing extra is imported here. The service is
 * exported so the catalogue module can fold PUBLIC evidence into the lot detail projection.
 */
@Module({
  controllers: [InspectionEvidenceController],
  providers: [InspectionEvidenceService],
  exports: [InspectionEvidenceService],
})
export class InspectionEvidenceModule {}
