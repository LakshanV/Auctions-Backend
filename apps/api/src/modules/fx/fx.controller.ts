import { Controller, Get, Query } from '@nestjs/common';
import { FxService } from './fx.service';

/**
 * Currency + FX API (Evolution E5). Public, read-only reference + **informational** conversion —
 * a display conversion is never binding (DECISIONS D5). Each surface is gated by its own
 * default-OFF flag in the service (`multiCurrency` / `fxDisplay`) and 404s until enabled. No RBAC:
 * these are non-sensitive reference reads (no provider keys are ever exposed).
 */
@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('currencies')
  currencies() {
    return { currencies: this.fx.currencies() };
  }

  @Get('rate')
  rate(@Query('base') base: string, @Query('quote') quote: string) {
    return this.fx.displayRate(base, quote);
  }

  @Get('convert')
  convert(
    @Query('amountMinor') amountMinor: string,
    @Query('base') base: string,
    @Query('quote') quote: string,
  ) {
    return this.fx.convert(Number(amountMinor), base, quote);
  }
}
