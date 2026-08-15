import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * Payment orchestration module (Evolution E8b). Flag-gated in the service; route resolution lives
 * in the pure `@singha/domain` engine. AppConfigService + PrismaService are global.
 */
@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
