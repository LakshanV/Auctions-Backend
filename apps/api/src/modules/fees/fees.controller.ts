import { Body, Controller, Post } from '@nestjs/common';
import {
  type ComputeChargesRequest,
  Permission,
  computeChargesRequestSchema,
} from '@singha/contracts';
import { FeesService } from './fees.service';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Fees / Tax API (Evolution E8, pack doc 10). Flag-gated (`feesEngine`) in the service, authorised
 * on the SERVER (`exchange:operate`). Computes + persists a reproducible charge breakdown for a
 * transaction shape; an unverified applied rule yields a non-binding preview (O3 / D7). No money
 * moves here — this is deterministic computation + an audit snapshot.
 */
@Controller('fees')
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Post('compute')
  @RequirePermissions(Permission.ExchangeOperate)
  compute(@Body(new ZodBody(computeChargesRequestSchema)) input: ComputeChargesRequest) {
    return this.fees.compute(input);
  }
}
