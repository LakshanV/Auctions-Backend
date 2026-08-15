import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InsightService } from './insight.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type Principal } from '../../shared/auth/principal';

type Features = Record<string, boolean>;

const member: Principal = { customerId: 'cust_1', roles: [], permissions: new Set(), aal: 'aal1' };

function makeService(features: Features): InsightService {
  const prisma = {} as unknown as PrismaService;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new InsightService(prisma, config);
}

describe('InsightService (E12 flag gating)', () => {
  it('404s the whole surface when insightEngine is OFF', async () => {
    const s = makeService({ insightEngine: false });
    await expect(s.match(member, {})).rejects.toThrow(NotFoundException);
    await expect(s.compareOffers(member, { proposals: [{ id: 'a' }] })).rejects.toThrow(
      NotFoundException,
    );
    await expect(s.pricing(member, {})).rejects.toThrow(NotFoundException);
    await expect(s.risk(member, { accountAgeDays: 1 })).rejects.toThrow(NotFoundException);
  });
});
