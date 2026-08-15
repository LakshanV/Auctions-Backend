import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SinghaIdService } from './singha-id.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type Principal } from '../../shared/auth/principal';

type Features = Record<string, boolean>;

const member: Principal = { customerId: 'cust_1', roles: [], permissions: new Set(), aal: 'aal1' };

function makeService(features: Features): SinghaIdService {
  const prisma = {} as unknown as PrismaService;
  const uow = {} as unknown as UnitOfWork;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new SinghaIdService(prisma, uow, config);
}

describe('SinghaIdService (E11 flag gating)', () => {
  it('404s the whole surface when singhaId is OFF', async () => {
    const s = makeService({ singhaId: false });
    await expect(s.getProfile(member)).rejects.toThrow(NotFoundException);
    await expect(s.updateProfile(member, { language: 'en' })).rejects.toThrow(NotFoundException);
    await expect(s.listCapabilities(member)).rejects.toThrow(NotFoundException);
    await expect(s.requestCapability(member, { capability: 'place_bid' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(s.evaluate(member, 'place_bid')).rejects.toThrow(NotFoundException);
    await expect(
      s.decide(member, { customerId: 'cust_2', capability: 'place_bid', decision: 'verified' }),
    ).rejects.toThrow(NotFoundException);
  });
});
