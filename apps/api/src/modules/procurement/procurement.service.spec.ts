import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type Principal } from '../../shared/auth/principal';

type Features = Record<string, boolean>;

const buyer: Principal = { customerId: 'cust_1', roles: [], permissions: new Set(), aal: 'aal1' };

function makeService(features: Features): ProcurementService {
  const prisma = {} as unknown as PrismaService;
  const uow = {} as unknown as UnitOfWork;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new ProcurementService(prisma, uow, config);
}

describe('ProcurementService (E9 flag gating)', () => {
  it('404s the whole surface when procurement is OFF', async () => {
    const s = makeService({ procurement: false });
    await expect(
      s.createRequest(buyer, { type: 'RFQ', title: 'Need widgets', currency: 'LKR' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      s.submitProposal(buyer, 'r1', { proposal: { currency: 'LKR', totalPriceMinor: 100 } }),
    ).rejects.toThrow(NotFoundException);
    await expect(s.award(buyer, 'r1', { selectedProposalId: 'p1' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(s.myRequests(buyer)).rejects.toThrow(NotFoundException);
  });
});
