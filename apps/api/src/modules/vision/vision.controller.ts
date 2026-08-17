import { Body, Controller, Post } from '@nestjs/common';
import { type VisionIntakeInput, Permission, visionIntakeSchema } from '@singha/contracts';
import { VisionService } from './vision.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * RW2 — Photo-first AI seller intake API (docs/10). Needs `ai:use`. The response is an ADVISORY
 * draft (per-field provenance + honest states + capture coach + evidence-based valuation): it never
 * creates or mutates an asset/listing. Turning any suggestion into a real listing field is a
 * separate, explicit, authorised human action (the existing listing/AI-apply paths).
 */
@Controller('ai/vision')
export class VisionController {
  constructor(private readonly vision: VisionService) {}

  @Post('intake')
  @RequirePermissions(Permission.AiUse)
  intake(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(visionIntakeSchema)) input: VisionIntakeInput,
  ) {
    return this.vision.intake(principal, input);
  }
}
