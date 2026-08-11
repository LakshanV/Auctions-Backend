import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SOCIAL_PROVIDER, MockSocialPublisher } from './social.provider';

/** Social Publisher. Mock publisher until Meta access — swap the binding only. */
@Module({
  controllers: [SocialController],
  providers: [SocialService, { provide: SOCIAL_PROVIDER, useClass: MockSocialPublisher }],
})
export class SocialModule {}
