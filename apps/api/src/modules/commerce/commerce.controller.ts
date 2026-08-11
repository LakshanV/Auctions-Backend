import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type AdvanceFulfilmentInput,
  type IssueInvoiceInput,
  Permission,
  type RecordPaymentInput,
  type SettleInput,
  type VerifyPaymentInput,
  advanceFulfilmentSchema,
  issueInvoiceSchema,
  recordPaymentSchema,
  settleSchema,
  verifyPaymentSchema,
} from '@singha/contracts';
import { CommerceService } from './commerce.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Commerce API (docs/14). `commerce:operate` = staff/accounts (invoice, verify,
 * release, fulfilment, settle, evidence); `commerce:pay` = the buyer.
 */
@Controller('commerce')
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}

  @Post('invoices')
  @RequirePermissions(Permission.CommerceOperate)
  issueInvoice(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(issueInvoiceSchema)) input: IssueInvoiceInput,
  ) {
    return this.commerce.issueInvoice(principal, input);
  }

  @Get('invoices/:id')
  getInvoice(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.commerce.getInvoice(principal, id);
  }

  @Post('invoices/:id/payments')
  @RequirePermissions(Permission.CommercePay)
  recordPayment(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(recordPaymentSchema)) input: RecordPaymentInput,
  ) {
    return this.commerce.recordPayment(principal, id, input);
  }

  @Post('payments/:id/verify')
  @RequirePermissions(Permission.CommerceOperate)
  verifyPayment(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(verifyPaymentSchema)) input: VerifyPaymentInput,
  ) {
    return this.commerce.verifyPayment(principal, id, input);
  }

  @Post('listings/:id/release')
  @RequirePermissions(Permission.CommerceOperate)
  release(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.commerce.release(principal, id);
  }

  @Post('listings/:id/fulfilment')
  @RequirePermissions(Permission.CommerceOperate)
  advance(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(advanceFulfilmentSchema)) input: AdvanceFulfilmentInput,
  ) {
    return this.commerce.advanceFulfilment(principal, id, input);
  }

  @Post('listings/:id/settlement')
  @RequirePermissions(Permission.CommerceOperate)
  settle(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(settleSchema)) input: SettleInput,
  ) {
    return this.commerce.settle(principal, id, input);
  }

  @Get('listings/:id/ledger')
  @RequirePermissions(Permission.CommerceOperate)
  ledger(@Param('id') id: string) {
    return this.commerce.ledgerFor(id);
  }

  @Get('listings/:id/evidence-pack')
  evidencePack(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.commerce.evidencePack(principal, id);
  }
}
