import { FX_RATE_SCALE, parseRateToScaled } from '@singha/domain';

/** A live (or faked) rate quote from a provider: quote units per 1 base unit, as a decimal string. */
export interface FxRateQuote {
  base: string;
  quote: string;
  /** Quote-currency units per 1 base-currency unit — a decimal string, never a float (D5). */
  rate: string;
  provider: string;
  quotedAt: Date;
}

/**
 * FX rate provider adapter (pack §14 provider abstraction; DECISIONS D12). The concrete source is
 * Google's currency conversion (owner directive) once its endpoint is confirmed (register O5);
 * until then a deterministic, credential-free fake is bound so no binding path depends on a live
 * rate. Swap the binding — nothing else changes.
 */
export interface FxRateProvider {
  readonly name: string;
  getRate(base: string, quote: string): Promise<FxRateQuote>;
}

export const FX_PROVIDER = Symbol('FX_PROVIDER');

const FX_RATE_SCALE_FACTOR = 10n ** BigInt(FX_RATE_SCALE); // 10^9

/** Format a 10^9-scaled integer rate back to a trimmed decimal string (exact round-trip). */
function formatScaledRate(scaled: bigint): string {
  const whole = scaled / FX_RATE_SCALE_FACTOR;
  const frac = scaled % FX_RATE_SCALE_FACTOR;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(FX_RATE_SCALE, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

/**
 * PLACEHOLDER mid-market rates expressed as units of each currency per 1 USD (dev/test only, NOT
 * authoritative). The fake derives any cross rate deterministically as `usdPer[quote] /
 * usdPer[base]` in exact integer math. Real rates arrive with the Google adapter (D12).
 */
const USD_PER: Record<string, string> = {
  USD: '1',
  LKR: '300',
  EUR: '0.92',
  GBP: '0.79',
  AUD: '1.52',
  INR: '83',
  AED: '3.67',
  SGD: '1.35',
  CNY: '7.24',
  JPY: '150',
};

/**
 * Deterministic, credential-free fake FX provider. Exercises the full quote → snapshot → convert
 * flow with no external call or cost. Cross rates are computed in bigint (never a float).
 */
export class FakeFxProvider implements FxRateProvider {
  readonly name = 'fake';

  async getRate(base: string, quote: string): Promise<FxRateQuote> {
    const b = USD_PER[base];
    const q = USD_PER[quote];
    if (!b || !q) throw new Error(`FakeFxProvider: unsupported currency pair ${base}/${quote}`);
    // rate = usdPer[quote] / usdPer[base], evaluated at 10^9 scale.
    const rateScaled = (parseRateToScaled(q) * FX_RATE_SCALE_FACTOR) / parseRateToScaled(b);
    return {
      base,
      quote,
      rate: formatScaledRate(rateScaled),
      provider: this.name,
      quotedAt: new Date(),
    };
  }
}

/**
 * Google-backed FX provider (DECISIONS D12). Wraps whichever Google currency endpoint the owner
 * confirms (register O5), read from `FX_API_URL` / `FX_API_KEY`. It is selected only when those are
 * configured; otherwise the fake is bound. The expected response is `{ "rate": <number|string> }`
 * for `?base=&quote=` — adjusted to the confirmed endpoint's shape when it lands.
 */
export class GoogleFxProvider implements FxRateProvider {
  readonly name = 'google';

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  async getRate(base: string, quote: string): Promise<FxRateQuote> {
    if (!this.apiUrl) {
      throw new Error('GoogleFxProvider: FX_API_URL not configured (owner action O5)');
    }
    const url = new URL(this.apiUrl);
    url.searchParams.set('base', base);
    url.searchParams.set('quote', quote);
    const res = await fetch(url, {
      headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : undefined,
    });
    if (!res.ok) throw new Error(`GoogleFxProvider: rate lookup failed (${res.status})`);
    const body = (await res.json()) as { rate?: number | string };
    if (body.rate == null) throw new Error('GoogleFxProvider: response missing rate');
    // Normalise to a decimal string; parseRateToScaled downstream rejects anything malformed.
    return { base, quote, rate: String(body.rate), provider: this.name, quotedAt: new Date() };
  }
}
