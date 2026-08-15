import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { type QuoteRequest, Permission, quoteRequestSchema } from '@singha/contracts';
import { LogisticsService } from './logistics.service';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Logistics API (Evolution E7, pack doc 10). Flag-gated (`logistics`) in the service. The Incoterm
 * + node reads are public reference data; requesting a quote requires an authenticated participant
 * (`exchange:participate`). A quote is an estimate, never a booking.
 */
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logistics: LogisticsService) {}

  @Get('incoterms')
  incoterms() {
    return { incoterms: this.logistics.incoterms() };
  }

  @Get('nodes')
  async nodes() {
    return { nodes: await this.logistics.nodes() };
  }

  @Post('quotes')
  @RequirePermissions(Permission.ExchangeParticipate)
  requestQuote(@Body(new ZodBody(quoteRequestSchema)) input: QuoteRequest) {
    return this.logistics.requestQuote(input);
  }

  @Get('quotes/:id')
  @RequirePermissions(Permission.ExchangeParticipate)
  getQuote(@Param('id') id: string) {
    return this.logistics.getQuote(id);
  }
}
