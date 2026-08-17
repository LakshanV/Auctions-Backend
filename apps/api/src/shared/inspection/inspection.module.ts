import { Global, Module } from '@nestjs/common';
import { INSPECTION_PROVIDER, MockInspectionProvider } from './inspection.provider';

/**
 * RW9 — inspection/certification adapter (matrix PRV-3). Binds INSPECTION_PROVIDER to a
 * deterministic mock until a real lab/inspector is configured — swap the binding, nothing else
 * changes. Global so asset/commerce modules can inject it when the certification flow is wired.
 */
@Global()
@Module({
  providers: [{ provide: INSPECTION_PROVIDER, useClass: MockInspectionProvider }],
  exports: [INSPECTION_PROVIDER],
})
export class InspectionModule {}
