import { Body, Controller, Post } from '@nestjs/common';
import { type RoutingInput, Permission, routingInputSchema } from '@singha/contracts';
import { RoutingService } from './routing.service';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Transaction Routing API (Evolution E6, pack doc 07). Staff/operator preview of how a transaction
 * routes — the deterministic engine resolves operator / payment route / terms / required
 * verification, or `MANUAL_REVIEW_REQUIRED`. Flag-gated (`transactionRouting`) in the service and
 * authorised on the SERVER (`exchange:operate`). No binding occurs here; this is resolution +
 * an audit snapshot.
 */
@Controller('routing')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Post('resolve')
  @RequirePermissions(Permission.ExchangeOperate)
  resolve(@Body(new ZodBody(routingInputSchema)) input: RoutingInput) {
    return this.routing.resolve(input);
  }

  @Post('terms')
  @RequirePermissions(Permission.ExchangeOperate)
  terms(@Body(new ZodBody(routingInputSchema)) input: RoutingInput) {
    return this.routing.terms(input);
  }
}
