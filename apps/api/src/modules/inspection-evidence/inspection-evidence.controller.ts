import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  Permission,
  type RecordInspectionEvidenceInput,
  recordInspectionEvidenceSchema,
} from '@singha/contracts';
import { InspectionEvidenceService } from './inspection-evidence.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * §20 — staff attach surface for inspection / certification evidence. Gated by `asset:manage`
 * (auction staff + admin, NOT sellers — sellers hold `media:manage` for their OWN listing media,
 * so that would let them self-certify) so evidence stays trustworthy: a seller can never mark
 * their own asset "certified". Customers read PUBLIC evidence through the catalogue lot detail,
 * never through this staff surface.
 */
@Controller('assets')
@RequirePermissions(Permission.AssetManage)
export class InspectionEvidenceController {
  constructor(private readonly evidence: InspectionEvidenceService) {}

  @Get(':id/inspection-evidence')
  list(@CurrentActor() principal: Principal, @Param('id') assetId: string) {
    return this.evidence.listForAsset(principal, assetId);
  }

  @Post(':id/inspection-evidence')
  record(
    @CurrentActor() principal: Principal,
    @Param('id') assetId: string,
    @Body(new ZodBody(recordInspectionEvidenceSchema)) input: RecordInspectionEvidenceInput,
  ) {
    return this.evidence.record(principal, assetId, input);
  }
}
