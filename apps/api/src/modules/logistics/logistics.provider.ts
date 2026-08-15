import { type TransportMode } from '@singha/contracts';
import { estimateFreightMinor, zoneMultiplierBps } from '@singha/domain';

export interface FreightQuoteInput {
  originCountry: string | null;
  destinationCountry: string | null;
  transportMode: TransportMode;
  chargeableUnits: number;
}

export interface FreightQuote {
  amountMinor: bigint;
  provider: string;
  assumptions: Record<string, unknown>;
}

/**
 * Logistics provider adapter (pack §14; DECISIONS D12-style provider abstraction). A real carrier/
 * aggregator implements this when its credentials arrive (owner register O6); until then the fake
 * supplies deterministic estimates so the full quote flow works with no external call or cost. A
 * quote is never a booking.
 */
export interface LogisticsProvider {
  readonly name: string;
  quote(input: FreightQuoteInput): Promise<FreightQuote>;
}

export const LOGISTICS_PROVIDER = Symbol('LOGISTICS_PROVIDER');

/**
 * Deterministic, credential-free fake. Uses the pure domain estimate (integer minor units, no
 * float) and records its assumptions so the quote is explainable and reproducible.
 */
export class FakeLogisticsProvider implements LogisticsProvider {
  readonly name = 'fake';

  async quote(input: FreightQuoteInput): Promise<FreightQuote> {
    const bps = zoneMultiplierBps(input.originCountry, input.destinationCountry);
    const amountMinor = estimateFreightMinor({
      transportMode: input.transportMode,
      chargeableUnits: input.chargeableUnits,
      zoneMultiplierBps: bps,
    });
    return {
      amountMinor,
      provider: this.name,
      assumptions: {
        zoneMultiplierBps: bps,
        originCountry: input.originCountry,
        destinationCountry: input.destinationCountry,
        basis: 'placeholder-rate-table',
        note: 'dev/test estimate — replace with a real provider (owner O6)',
      },
    };
  }
}
