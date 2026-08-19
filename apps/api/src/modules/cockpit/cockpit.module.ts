import { Module } from '@nestjs/common';
import { CockpitController } from './cockpit.controller';
import { CockpitService } from './cockpit.service';
import { MemberModule } from '../member/member.module';

/**
 * Singha Cockpit — the one unified, adaptive read-model for the signed-in client. Imports
 * MemberModule for the authoritative CreditExposureService (bid-capacity facts); everything else is
 * a self-scoped Prisma read. PrismaService is global. Pure read-model — never a source of truth.
 */
@Module({
  imports: [MemberModule],
  controllers: [CockpitController],
  providers: [CockpitService],
  exports: [CockpitService],
})
export class CockpitModule {}
