import { Body, Controller, Get, NotFoundException, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type UpdateNotificationPreferencesInput,
  updateNotificationPreferencesSchema,
} from '@singha/contracts';
import { EngagementService } from './engagement.service';
import { AppConfigService } from '../../config/config.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

const simulateSchema = z.object({
  eventType: z.string().min(1).max(60),
  classification: z.enum(['transactional', 'engagement']),
  subjectId: z.string().min(1).max(120),
  category: z.string().max(40).optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
});

/**
 * Engagement notification API (pack doc 05), gated on `engagementV3`. A customer manages
 * their own preferences and reads their own delivery ledger. `simulate` drives the policy
 * + fake-provider pipeline end-to-end for acceptance (it only ever dispatches to the
 * authenticated caller). When the flag is OFF the whole surface 404s.
 */
@Controller('engagement')
export class EngagementController {
  constructor(
    private readonly engagement: EngagementService,
    private readonly config: AppConfigService,
  ) {}

  private ensureEnabled() {
    if (!this.config.get().features.engagementV3) throw new NotFoundException('Not found');
  }

  @Get('preferences')
  getPreferences(@CurrentActor() principal: Principal) {
    this.ensureEnabled();
    return this.engagement.getPreferences(principal);
  }

  @Put('preferences')
  updatePreferences(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(updateNotificationPreferencesSchema))
    input: UpdateNotificationPreferencesInput,
  ) {
    this.ensureEnabled();
    return this.engagement.updatePreferences(principal, input);
  }

  @Get('notifications')
  notifications(@CurrentActor() principal: Principal, @Query('limit') limit?: string) {
    this.ensureEnabled();
    return this.engagement.listDeliveries(principal, Number(limit) || 30);
  }

  @Post('notifications/simulate')
  simulate(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(simulateSchema)) input: z.infer<typeof simulateSchema>,
  ) {
    this.ensureEnabled();
    return this.engagement.simulateToSelf(principal, input);
  }
}
