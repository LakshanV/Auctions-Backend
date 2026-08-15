import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SupplyService } from './supply.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type Principal } from '../../shared/auth/principal';

type Features = Record<string, boolean>;

const supplier: Principal = {
  customerId: 'cust_1',
  roles: [],
  permissions: new Set(),
  aal: 'aal1',
};

function makeService(features: Features): SupplyService {
  const prisma = {} as unknown as PrismaService;
  const uow = {} as unknown as UnitOfWork;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new SupplyService(prisma, uow, config);
}

describe('SupplyService (E10 flag gating)', () => {
  it('404s the supply surface when supplyProgrammes is OFF', async () => {
    const s = makeService({ supplyProgrammes: false, perishableGoods: true });
    await expect(
      s.createProgramme(supplier, { product: 'Red Onion', currency: 'LKR' }),
    ).rejects.toThrow(NotFoundException);
    await expect(s.myProgrammes(supplier)).rejects.toThrow(NotFoundException);
    await expect(s.recommend(supplier, { product: 'onion' })).rejects.toThrow(NotFoundException);
  });

  it('404s the perishable surface when perishableGoods is OFF', async () => {
    const s = makeService({ supplyProgrammes: true, perishableGoods: false });
    await expect(
      s.attachPerishable(supplier, {
        subjectType: 'supply_programme',
        subjectId: 'sp_1',
        metadata: {},
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(s.getPerishable(supplier, 'supply_programme', 'sp_1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
