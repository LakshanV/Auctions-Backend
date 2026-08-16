import { describe, expect, it, vi } from 'vitest';
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

/**
 * `myOffers` PUBLIC listing enrichment (CX pack doc 05): the buyer offer console previously
 * showed a raw listing CUID because `GET /commercial-offers/mine` carried no listing context.
 * These specs mock Prisma directly (no DB) to prove the additive `listing` context is attached
 * without disturbing any existing `offerView` field, and that only public fields are exposed.
 */
function makeServiceWithOfferRows(rows: unknown[]): {
  service: OffersService;
  findMany: ReturnType<typeof vi.fn>;
} {
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = { offer: { findMany } } as unknown as PrismaService;
  const uow = {} as unknown as UnitOfWork;
  const config = { get: () => ({ features: {} }) } as unknown as AppConfigService;
  const exposure = {} as unknown as CreditExposureService;
  return { service: new OffersService(prisma, uow, config, exposure), findMany };
}

describe('OffersService.myOffers (additive PUBLIC listing context, CX pack doc 05)', () => {
  it('attaches a listing object (title/publicRef/saleMethod/location/cover) without changing existing offer fields', async () => {
    const offerRow = {
      id: 'offer_1',
      listingId: 'listing_1',
      customerId: 'cust_1',
      status: 'open',
      amountMinor: 500_000n,
      currency: 'LKR',
      sealed: false,
      currentRevisionId: 'rev_1',
      saleMethodCode: 'MAKE_OFFER',
      listing: {
        title: 'Vintage Watch',
        publicRef: 'LOT-0001',
        saleMethod: 'MAKE_OFFER',
        locationCity: 'Colombo',
        locationRegion: null,
        asset: {
          media: [
            { storageKey: 'media/other.jpg', isCover: false, sortOrder: 1 },
            { storageKey: 'media/cover.jpg', isCover: true, sortOrder: 0 },
          ],
        },
      },
    };
    const { service, findMany } = makeServiceWithOfferRows([offerRow]);

    const result = await service.myOffers(buyer);

    expect(result).toHaveLength(1);
    // Every pre-existing offerView field is untouched — purely additive.
    expect(result[0]).toMatchObject({
      id: 'offer_1',
      listingId: 'listing_1',
      customerId: 'cust_1',
      status: 'open',
      amountMinor: 500_000,
      currency: 'LKR',
      sealed: false,
      currentRevisionId: 'rev_1',
      saleMethodCode: 'MAKE_OFFER',
    });
    // New additive listing context — cover picked by isCover, never by array order.
    expect(result[0]?.listing).toEqual({
      title: 'Vintage Watch',
      publicRef: 'LOT-0001',
      saleMethod: 'MAKE_OFFER',
      location: { city: 'Colombo', region: null },
      coverStorageKey: 'media/cover.jpg',
    });
    // Scoped to the caller's own offers; the media sub-select stays PUBLIC/ready-only —
    // no reserve, seller floor, proxy max, competitor or KYC field is ever requested.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: 'cust_1' },
        include: expect.objectContaining({
          listing: expect.objectContaining({
            select: expect.objectContaining({
              title: true,
              publicRef: true,
              saleMethod: true,
              locationCity: true,
              locationRegion: true,
              asset: expect.objectContaining({
                select: expect.objectContaining({
                  media: expect.objectContaining({
                    where: { visibility: 'public', status: 'ready', kind: 'image' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('falls back to the lowest sortOrder image when none is flagged isCover', async () => {
    const offerRow = {
      id: 'offer_2',
      listingId: 'listing_2',
      customerId: 'cust_1',
      status: 'open',
      amountMinor: 250_000n,
      currency: 'LKR',
      listing: {
        title: null,
        publicRef: 'LOT-0002',
        saleMethod: 'SEALED_TENDER',
        locationCity: null,
        locationRegion: null,
        asset: {
          media: [
            { storageKey: 'media/second.jpg', isCover: false, sortOrder: 2 },
            { storageKey: 'media/first.jpg', isCover: false, sortOrder: 1 },
          ],
        },
      },
    };
    const { service } = makeServiceWithOfferRows([offerRow]);

    const result = await service.myOffers(buyer);

    expect(result[0]?.listing).toEqual({
      title: null,
      publicRef: 'LOT-0002',
      saleMethod: 'SEALED_TENDER',
      location: null,
      coverStorageKey: 'media/first.jpg',
    });
  });

  it('returns a null location and coverStorageKey when the listing has no city/region or public-ready image', async () => {
    const offerRow = {
      id: 'offer_3',
      listingId: 'listing_3',
      customerId: 'cust_1',
      status: 'withdrawn',
      amountMinor: 0n,
      currency: 'LKR',
      listing: {
        title: 'No Photos Yet',
        publicRef: 'LOT-0003',
        saleMethod: 'BUY_NOW',
        locationCity: null,
        locationRegion: 'Western',
        asset: { media: [] },
      },
    };
    const { service } = makeServiceWithOfferRows([offerRow]);

    const result = await service.myOffers(buyer);

    expect(result[0]?.listing).toEqual({
      title: 'No Photos Yet',
      publicRef: 'LOT-0003',
      saleMethod: 'BUY_NOW',
      location: { city: null, region: 'Western' },
      coverStorageKey: null,
    });
  });
});
