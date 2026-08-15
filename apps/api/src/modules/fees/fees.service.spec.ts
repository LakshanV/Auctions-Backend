import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { FeesService } from './fees.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';

type Features = Record<string, boolean>;

const feeRule = (over: Record<string, unknown>) => ({
  code: 'R',
  version: 1,
  priority: 0,
  component: 'buyer_premium',
  side: 'BUYER',
  basis: 'PERCENT',
  rateBps: 1000,
  fixedMinor: null,
  appliesTo: 'PRINCIPAL',
  operatorCode: null,
  jurisdiction: null,
  category: null,
  saleMethodCode: null,
  minPrincipalMinor: null,
  maxPrincipalMinor: null,
  verification: 'verified',
  ...over,
});

function makeService(features: Features, rules: unknown[] = []): FeesService {
  const prisma = {
    feeRule: { findMany: async () => rules },
    feeBreakdown: { create: async () => ({}) },
  } as unknown as PrismaService;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new FeesService(prisma, config);
}

describe('FeesService (E8 flag gating + reproducible breakdown)', () => {
  it('404s when feesEngine is OFF', async () => {
    const s = makeService({ feesEngine: false });
    await expect(s.compute({ principalMinor: 100_000, currency: 'LKR' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('computes a breakdown and persists it (reproducible line + rule version)', async () => {
    const s = makeService({ feesEngine: true }, [feeRule({ code: 'PREM', version: 2 })]);
    const out = await s.compute({ principalMinor: 100_000, currency: 'LKR' });
    expect(out.buyerFeesMinor).toBe(10_000);
    expect(out.buyerTotalMinor).toBe(110_000);
    expect(out.status).toBe('RESOLVED');
    expect(out.breakdownId).toBeTruthy();
    expect(out.lines[0]?.appliedRuleCode).toBe('PREM');
    expect(out.lines[0]?.appliedRuleVersion).toBe(2);
  });

  it('an unverified tax rule yields a non-binding preview (O3 / D7)', async () => {
    const s = makeService({ feesEngine: true }, [
      feeRule({ code: 'TAX', component: 'tax', rateBps: 1500, verification: 'draft' }),
    ]);
    const out = await s.compute({ principalMinor: 100_000, currency: 'LKR' });
    expect(out.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(out.taxMinor).toBe(15_000);
  });
});
