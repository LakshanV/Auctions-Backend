import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type Principal } from '../../shared/auth/principal';

type Features = Record<string, boolean>;

const member: Principal = { customerId: 'cust_1', roles: [], permissions: new Set(), aal: 'aal1' };

function makeService(features: Features): DashboardService {
  const prisma = {} as unknown as PrismaService;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new DashboardService(prisma, config);
}

describe('DashboardService (E11b flag gating)', () => {
  it('404s the dashboard when the flag is OFF', async () => {
    const s = makeService({ dashboard: false, controlCentre: true });
    await expect(s.getDashboard(member)).rejects.toThrow(NotFoundException);
  });

  it('404s the control centre when the flag is OFF', async () => {
    const s = makeService({ dashboard: true, controlCentre: false });
    await expect(s.getControlCentreOverview(member)).rejects.toThrow(NotFoundException);
  });
});
