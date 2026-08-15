import { Module } from '@nestjs/common';
import { SinghaIdController } from './singha-id.controller';
import { SinghaIdService } from './singha-id.service';

/**
 * Singha ID module (Evolution E11). Flag-gated in the service; the capability-based verification
 * logic lives in the pure `@singha/domain` engine. AppConfigService + PrismaService + UnitOfWork are
 * global.
 */
@Module({
  controllers: [SinghaIdController],
  providers: [SinghaIdService],
  exports: [SinghaIdService],
})
export class SinghaIdModule {}
