import { Body, Controller, Post } from '@nestjs/common';
import {
  type PaymentWebhookInput,
  Permission,
  type ResolvePaymentRouteInput,
  paymentWebhookSchema,
  resolvePaymentRouteSchema,
} from '@singha/contracts';
import { PaymentsService } from './payments.service';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Payment orchestration API (Evolution E8b, pack doc 10). Flag-gated (`operatorPayments`) in the
 * service. `resolve-route` is staff/operator (`exchange:operate`) and returns the regulated route
 * or `MANUAL_REVIEW_REQUIRED`. `webhook` is public but signature-verified + idempotent (external
 * providers call it). No money moves here — Singha holds no internal balance.
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('resolve-route')
  @RequirePermissions(Permission.ExchangeOperate)
  resolveRoute(@Body(new ZodBody(resolvePaymentRouteSchema)) input: ResolvePaymentRouteInput) {
    return this.payments.resolveRoute(input);
  }

  @Post('webhook')
  webhook(@Body(new ZodBody(paymentWebhookSchema)) input: PaymentWebhookInput) {
    return this.payments.handleWebhook(input);
  }
}
