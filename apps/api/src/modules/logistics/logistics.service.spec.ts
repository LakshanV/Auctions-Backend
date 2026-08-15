import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { FakeLogisticsProvider } from './logistics.provider';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';

type Features = Record<string, boolean>;

function makeService(features: Features, nodes: Record<string, unknown> = {}): LogisticsService {
  const prisma = {
    logisticsNode: {
      findMany: async () => [],
      findUnique: async ({ where }: { where: { code: string } }) => nodes[where.code] ?? null,
    },
    logisticsQuote: {
      create: async ({ data }: { data: Record<string, unknown> }) => data,
    },
  } as unknown as PrismaService;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  const uow = {} as unknown as UnitOfWork;
  return new LogisticsService(prisma, config, uow, new FakeLogisticsProvider());
}

const LK = { code: 'LKCMB', countryCode: 'LK' };
const AU = { code: 'AUSYD', countryCode: 'AU' };

describe('LogisticsService (E7 flag gating + deterministic quote)', () => {
  it('404s every surface when logistics is OFF', async () => {
    const s = makeService({ logistics: false });
    expect(() => s.incoterms()).toThrow(NotFoundException);
    await expect(s.nodes()).rejects.toThrow(NotFoundException);
    await expect(
      s.requestQuote({
        originNodeCode: 'LKCMB',
        destinationNodeCode: 'AUSYD',
        transportMode: 'SEA_FCL',
        incoterm: 'FOB',
        chargeableUnits: 10,
        currency: 'USD',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('lists the Incoterm taxonomy when enabled', () => {
    const s = makeService({ logistics: true });
    expect(s.incoterms().map((i) => i.code)).toContain('CIF');
  });

  it('produces a deterministic estimate and derives freight responsibility from the Incoterm', async () => {
    const s = makeService({ logistics: true }, { LKCMB: LK, AUSYD: AU });
    // SEA_FCL 500/unit × 10 × 250% (cross-border LK→AU) = 12,500 minor.
    const out = await s.requestQuote({
      originNodeCode: 'LKCMB',
      destinationNodeCode: 'AUSYD',
      transportMode: 'SEA_FCL',
      incoterm: 'FOB', // buyer bears freight
      chargeableUnits: 10,
      currency: 'USD',
    });
    expect(out.amountMinor).toBe(12_500);
    expect(out.freightArranger).toBe('buyer');
    expect(out.status).toBe('QUOTED');
    expect(out.provider).toBe('fake');
    expect(new Date(out.expiresAt).getTime()).toBeGreaterThan(new Date(out.quotedAt).getTime());
  });

  it('404s an unknown origin/destination node', async () => {
    const s = makeService({ logistics: true }, { LKCMB: LK });
    await expect(
      s.requestQuote({
        originNodeCode: 'LKCMB',
        destinationNodeCode: 'NOPE',
        transportMode: 'AIR',
        incoterm: 'CIF',
        chargeableUnits: 1,
        currency: 'USD',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
