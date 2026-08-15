import { Module } from '@nestjs/common';
import { NodeController } from './node.controller';
import { NodeService } from './node.service';

/**
 * Satellite Market Node + SEO module (Evolution E13). Flag-gated in the service; the mode/origination
 * gating and SEO helpers live in the pure `@singha/domain` engine. AppConfigService + PrismaService
 * are global.
 */
@Module({
  controllers: [NodeController],
  providers: [NodeService],
  exports: [NodeService],
})
export class NodeModule {}
