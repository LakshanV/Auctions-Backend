import { Module } from '@nestjs/common';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';

/**
 * Fees / Tax module (Evolution E8). Flag-gated in the service; the computation lives in the pure
 * `@singha/domain` engine. AppConfigService + PrismaService are global.
 */
@Module({
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
