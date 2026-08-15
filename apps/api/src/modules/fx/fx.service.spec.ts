import { describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FxService } from './fx.service';
import { FakeFxProvider } from './fx.provider';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';

type Features = Record<string, boolean>;

/**
 * Fast, mostly-DB-free guards for the FX read service (E5). Prisma is mocked to a cold cache
 * (findFirst → null) so a conversion goes through the deterministic FakeFxProvider; the E2E
 * covers real persistence + caching. Proves the flag gates, the informational (`binding: false`)
 * contract, the float-free conversion, and currency validation.
 */
function makeService(features: Features): FxService {
  const prisma = {
    fxRateSnapshot: {
      findFirst: async () => null,
      create: async () => ({}),
    },
  } as unknown as PrismaService;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new FxService(prisma, config, new FakeFxProvider());
}

describe('FxService (E5 flag gating + informational conversion)', () => {
  it('404s currencies when multiCurrency is OFF, and the FX surfaces when fxDisplay is OFF', async () => {
    const s = makeService({ multiCurrency: false, fxDisplay: false });
    expect(() => s.currencies()).toThrow(NotFoundException);
    await expect(s.displayRate('USD', 'LKR')).rejects.toThrow(NotFoundException);
    await expect(s.convert(10_000, 'USD', 'LKR')).rejects.toThrow(NotFoundException);
  });

  it('lists supported currencies when multiCurrency is ON', () => {
    const s = makeService({ multiCurrency: true, fxDisplay: false });
    const codes = s.currencies().map((c) => c.code);
    expect(codes).toContain('LKR');
    expect(codes).toContain('USD');
  });

  it('converts for DISPLAY only — never binding (D5), float-free', async () => {
    const s = makeService({ multiCurrency: true, fxDisplay: true });
    const out = await s.convert(10_000, 'USD', 'LKR'); // $100.00 × 300 = 30,000.00 LKR
    expect(out.convertedMinor).toBe(3_000_000);
    expect(out.binding).toBe(false);
    expect(out.rate.provider).toBe('fake');
    expect(out.base).toBe('USD');
    expect(out.quote).toBe('LKR');
  });

  it('treats a same-currency conversion as identity at rate 1', async () => {
    const s = makeService({ multiCurrency: true, fxDisplay: true });
    const out = await s.convert(4_242, 'LKR', 'LKR');
    expect(out.convertedMinor).toBe(4_242);
    expect(out.rate.rate).toBe('1');
  });

  it('rejects an unsupported currency and a negative amount', async () => {
    const s = makeService({ multiCurrency: true, fxDisplay: true });
    await expect(s.convert(10_000, 'USD', 'XYZ')).rejects.toThrow(BadRequestException);
    await expect(s.convert(-1, 'USD', 'LKR')).rejects.toThrow(BadRequestException);
  });
});
