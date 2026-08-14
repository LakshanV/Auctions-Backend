import { Module } from '@nestjs/common';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';
import { FakeNotificationProvider, NOTIFICATION_PROVIDER } from './notification.provider';

/**
 * Engagement module (pack doc 05). The notification transport is bound to the
 * credential-free fake until a real WhatsApp/SMS/email/push adapter is configured;
 * swapping it requires no change to EngagementService.
 */
@Module({
  controllers: [EngagementController],
  providers: [
    EngagementService,
    { provide: NOTIFICATION_PROVIDER, useClass: FakeNotificationProvider },
  ],
  exports: [EngagementService],
})
export class EngagementModule {}
