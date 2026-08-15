import { describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Permission } from '@singha/contracts';
import { OffersService } from './offers.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type CreditExposureService } from '../member/credit-exposure.service';
import { type Principal } from '../../shared/auth/principal';

type Features = Record<string, boolean>;

/**
 * Fast, DB-free guards for the Commercial Offer Engine V2 (E4). The binding/atomic paths are
 * covered by the real-Postgres integration test; here we prove the flag gates and the
 * server-side sealed authorisation reject BEFORE any datastore access.
 */
function makeService(features: Features): OffersService {
  const prisma = {} as unknown as PrismaService;
  const uow = {} as unknown as UnitOfWork;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  const exposure = {} as unknown as CreditExposureService;
  return new OffersService(prisma, uow, config, exposure);
}

const buyer: Principal = {
  customerId: 'cust_1',
  roles: [],
  permissions: new Set(),
  aal: 'aal1',
};
const operator: Principal = {
  customerId: 'staff_1',
  roles: [],
  permissions: new Set([Permission.ExchangeOperate]),
  aal: 'aal1',
};

const proposal = { currency: 'LKR', totalPriceMinor: 1000 };

describe('OffersService (E4 flag gating + sealed authorisation)', () => {
  it('404s the whole surface when commercialOffersV2 is OFF', async () => {
    const s = makeService({ commercialOffersV2: false, sealedOffers: false });
    await expect(
      s.submitOffer(buyer, { listingId: 'l1', saleMethodCode: 'MAKE_OFFER', proposal }),
    ).rejects.toThrow(NotFoundException);
    await expect(s.acceptOffer(operator, 'o1')).rejects.toThrow(NotFoundException);
    await expect(s.awardSealed(operator, 'l1', { policy: 'AUTO_HIGHEST' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('404s a sealed submission when sealedOffers is OFF (even with commercialOffersV2 ON)', async () => {
    const s = makeService({ commercialOffersV2: true, sealedOffers: false });
    await expect(
      s.submitOffer(buyer, { listingId: 'l1', saleMethodCode: 'SEALED', sealed: true, proposal }),
    ).rejects.toThrow(NotFoundException);
  });

  it('forbids a buyer from revealing or awarding sealed offers (server-side, before any DB read)', async () => {
    const s = makeService({ commercialOffersV2: true, sealedOffers: true });
    await expect(s.revealSealed(buyer, 'l1')).rejects.toThrow(ForbiddenException);
    await expect(s.awardSealed(buyer, 'l1', { policy: 'AUTO_HIGHEST' })).rejects.toThrow(
      ForbiddenException,
    );
  });
});
