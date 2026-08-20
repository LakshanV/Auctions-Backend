import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type MyOffersQuery, Permission, type SubmitOfferInput } from '@singha/contracts';
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
function makeService(
  features: Features,
  ownership?: {
    ownerCustomerId?: string | null;
    sellerOrgId?: string | null;
    memberRole?: 'owner' | 'admin' | null;
  },
): OffersService {
  // RW5: resolveManageRole reads the listing's asset (direct owner + selling org) and, for an org,
  // the caller's membership. Default (no ownership arg) → listing not found → a non-operator,
  // non-owner is refused (the buyer / competitor case).
  const asset = ownership
    ? {
        ownerCustomerId: ownership.ownerCustomerId ?? null,
        sellerOrganizationId: ownership.sellerOrgId ?? null,
      }
    : null;
  const prisma = {
    listing: { findUnique: vi.fn().mockResolvedValue(asset ? { asset } : null) },
    organizationMember: {
      findFirst: vi
        .fn()
        .mockResolvedValue(ownership?.memberRole ? { id: 'm1', role: ownership.memberRole } : null),
    },
    offer: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
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
// RW5 — a verified seller reaches the owner-scoped routes via `exchange:operate-own`, but the
// service still verifies they own the listing (never the broad operator grant).
const seller: Principal = {
  customerId: 'seller_owner',
  roles: [],
  permissions: new Set([Permission.ExchangeOperateOwn]),
  aal: 'aal1',
};

const proposal = { currency: 'LKR', totalPriceMinor: 1000 };

describe('OffersService (E4 flag gating + sealed authorisation)', () => {
  it('404s the whole surface when commercialOffersV2 is OFF', async () => {
    const s = makeService({ commercialOffersV2: false, sealedOffers: false });
    await expect(
      s.submitOffer(buyer, {
        listingId: 'l1',
        saleMethodCode: 'MAKE_OFFER',
        proposal,
        context: 'personal',
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(s.acceptOffer(operator, 'o1')).rejects.toThrow(NotFoundException);
    await expect(s.awardSealed(operator, 'l1', { policy: 'AUTO_HIGHEST' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('404s a sealed submission when sealedOffers is OFF (even with commercialOffersV2 ON)', async () => {
    const s = makeService({ commercialOffersV2: true, sealedOffers: false });
    await expect(
      s.submitOffer(buyer, {
        listingId: 'l1',
        saleMethodCode: 'SEALED',
        sealed: true,
        proposal,
        context: 'personal',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('forbids a buyer from revealing or awarding sealed offers (server-side ownership check)', async () => {
    // Default makeService → no seller-org / no membership → a non-operator, non-owner is refused.
    const s = makeService({ commercialOffersV2: true, sealedOffers: true });
    await expect(s.revealSealed(buyer, 'l1')).rejects.toThrow(ForbiddenException);
    await expect(s.awardSealed(buyer, 'l1', { policy: 'AUTO_HIGHEST' })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(s.offersForListing(buyer, 'l1')).rejects.toThrow(ForbiddenException);
  });

  it('RW5 — an org owning seller PASSES sealed authorisation for their own listing', async () => {
    // seller_owner is an owner of the listing's seller org → resolveManageRole returns 'seller'
    // (canRevealSealedOffers true), so it proceeds past authz and only then hits "no sealed offers".
    const s = makeService(
      { commercialOffersV2: true, sealedOffers: true },
      { sellerOrgId: 'org_1', memberRole: 'owner' },
    );
    await expect(s.revealSealed(seller, 'l1')).rejects.toThrow(BadRequestException);
  });

  it('RW5 — an individual consignor (asset owner, no org) PASSES for their own listing', async () => {
    // The asset is owned directly by seller_owner (ownerCustomerId), no selling org → still 'seller'.
    const s = makeService(
      { commercialOffersV2: true, sealedOffers: true },
      { ownerCustomerId: 'seller_owner' },
    );
    await expect(s.revealSealed(seller, 'l1')).rejects.toThrow(BadRequestException);
  });

  it('RW5 — a seller who does NOT own the listing is refused (no IDOR across sellers)', async () => {
    // The listing belongs to org_2; seller_owner has no membership there → 403.
    const s = makeService(
      { commercialOffersV2: true, sealedOffers: true },
      { sellerOrgId: 'org_2', memberRole: null },
    );
    await expect(s.revealSealed(seller, 'l1')).rejects.toThrow(ForbiddenException);
    await expect(s.awardSealed(seller, 'l1', { policy: 'AUTO_HIGHEST' })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(s.offersForListing(seller, 'l1')).rejects.toThrow(ForbiddenException);
  });

  it('RW5 — a platform operator manages any listing without an ownership check', async () => {
    // operator has exchange:operate → short-circuits to 'operator' (no org lookup); proceeds to
    // "no sealed offers" rather than a 403.
    const s = makeService({ commercialOffersV2: true, sealedOffers: true });
    await expect(s.revealSealed(operator, 'l1')).rejects.toThrow(BadRequestException);
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

    const { offers } = await service.myOffers(buyer);

    expect(offers).toHaveLength(1);
    // Every pre-existing offerView field is untouched — purely additive.
    expect(offers[0]).toMatchObject({
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
    expect(offers[0]?.listing).toEqual({
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
        // Personal book only — `buyerOrganizationId: null` keeps an organization-attributed offer
        // out of the individual's console even though they submitted it.
        where: { customerId: 'cust_1', buyerOrganizationId: null },
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

    const { offers } = await service.myOffers(buyer);

    expect(offers[0]?.listing).toEqual({
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

    const { offers } = await service.myOffers(buyer);

    expect(offers[0]?.listing).toEqual({
      title: 'No Photos Yet',
      publicRef: 'LOT-0003',
      saleMethod: 'BUY_NOW',
      location: { city: null, region: 'Western' },
      coverStorageKey: null,
    });
  });
});


// ---------------------------------------------------------------------------
// Organization-attributed offers: explicit acting context + disjoint buyer books
// ---------------------------------------------------------------------------

const colleague: Principal = {
  customerId: 'cust_colleague',
  roles: [],
  permissions: new Set([Permission.ExchangeParticipate]),
  aal: 'aal1',
};
const rival: Principal = {
  customerId: 'cust_rival',
  roles: [],
  permissions: new Set([Permission.ExchangeParticipate]),
  aal: 'aal1',
};
const anonymous: Principal = { customerId: null, roles: [], permissions: new Set(), aal: 'aal1' };
const orgStaff: Principal = {
  customerId: 'staff_1',
  roles: [],
  permissions: new Set([Permission.OrganizationManage]),
  aal: 'aal1',
};

const OFFERS_ON: Features = { commercialOffersV2: true, sealedOffers: true };
const PERSONAL: MyOffersQuery = { context: 'personal' };
const ORG1: MyOffersQuery = { context: 'organization', organizationId: 'org_1' };
const ORG2: MyOffersQuery = { context: 'organization', organizationId: 'org_2' };

const submission = (over: Partial<SubmitOfferInput> = {}): SubmitOfferInput => ({
  listingId: 'l1',
  saleMethodCode: 'MAKE_OFFER',
  proposal,
  context: 'personal',
  ...over,
});

interface OfferListingContext {
  title: string | null;
  publicRef: string;
  saleMethod: string;
  locationCity: string | null;
  locationRegion: string | null;
  asset: { media: { storageKey: string; isCover: boolean; sortOrder: number }[] };
}

interface OfferRow {
  id: string;
  listingId: string;
  customerId: string;
  buyerOrganizationId: string | null;
  status: string;
  amountMinor: bigint;
  currency: string;
  sealed: boolean;
  currentRevisionId: string | null;
  saleMethodCode: string | null;
  revealedAt: Date | null;
  createdAt: Date;
  listing: OfferListingContext;
}

const offerRow = (over: Partial<OfferRow> = {}): OfferRow => ({
  id: 'offer_seed',
  listingId: 'l1',
  customerId: 'cust_1',
  buyerOrganizationId: null,
  status: 'open',
  amountMinor: 100n,
  currency: 'LKR',
  sealed: false,
  currentRevisionId: 'rev_seed',
  saleMethodCode: 'MAKE_OFFER',
  revealedAt: null,
  createdAt: new Date('2026-08-20T00:00:00.000Z'),
  listing: {
    title: 'Seeded Lot',
    publicRef: 'LOT-9999',
    saleMethod: 'MAKE_OFFER',
    locationCity: null,
    locationRegion: null,
    asset: { media: [] },
  },
  ...over,
});

interface BookSeed {
  organizations?: { id: string }[];
  memberships?: { organizationId: string; customerId: string; role: string }[];
  offers?: OfferRow[];
  /**
   * The listing's asset attribution, used by the untouched RW5 seller check. The listing itself
   * always exists here; omit this to make nobody the seller (so a competing buyer is refused).
   */
  asset?: { ownerCustomerId: string | null; sellerOrganizationId: string | null };
}

type Row = Record<string, unknown>;

function rowMatches(row: Row, where: Row | undefined): boolean {
  for (const [key, expected] of Object.entries(where ?? {})) {
    if (expected !== null && typeof expected === 'object') {
      const notIn = (expected as { notIn?: unknown[] }).notIn;
      if (Array.isArray(notIn)) {
        if (notIn.includes(row[key])) return false;
        continue;
      }
      return false;
    }
    if (row[key] !== expected) return false;
  }
  return true;
}

/**
 * In-memory stand-in that applies the service's REAL `where` clauses, so the isolation tests below
 * prove the scoping rather than merely asserting a mock was called: drop `buyerOrganizationId: null`
 * from the personal filter and the personal console immediately starts returning the org's offers.
 */
function makeBookService(features: Features = OFFERS_ON, seed: BookSeed = {}) {
  const offers = [...(seed.offers ?? [])];
  const created: Row[] = [];
  const updated: Row[] = [];
  const memberships = seed.memberships ?? [];
  const listingRow = {
    id: 'l1',
    asset: seed.asset ?? { ownerCustomerId: null, sellerOrganizationId: null },
  };
  const prisma = {
    organization: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve((seed.organizations ?? []).find((o) => o.id === where.id) ?? null),
    },
    organizationMember: {
      findFirst: ({ where }: { where: Row }) =>
        Promise.resolve(memberships.find((m) => rowMatches(m as unknown as Row, where)) ?? null),
    },
    listing: { findUnique: () => Promise.resolve(listingRow) },
    sale: { findUnique: () => Promise.resolve(null) },
    offer: {
      findMany: ({ where }: { where?: Row } = {}) =>
        Promise.resolve(offers.filter((o) => rowMatches(o as unknown as Row, where))),
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(offers.find((o) => o.id === where.id) ?? null),
      findFirst: ({ where }: { where?: Row } = {}) =>
        Promise.resolve(offers.find((o) => rowMatches(o as unknown as Row, where)) ?? null),
    },
  } as unknown as PrismaService;
  const uow = {
    execute: (_actor: unknown, fn: (ctx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          tx: {
            offer: {
              create: ({ data }: { data: Row }) => {
                created.push(data);
                return Promise.resolve(data);
              },
              update: ({ where, data }: { where: { id: string }; data: Row }) => {
                updated.push({ id: where.id, ...data });
                const row = offers.find((o) => o.id === where.id);
                return Promise.resolve({ ...row, ...data });
              },
            },
            offerRevision: { create: () => Promise.resolve({}) },
            offerEvent: { create: () => Promise.resolve({}) },
          },
          emit: () => undefined,
          audit: () => undefined,
        }),
      ),
  } as unknown as UnitOfWork;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  const exposure = {} as unknown as CreditExposureService;
  return { service: new OffersService(prisma, uow, config, exposure), created, updated };
}

describe('OffersService organization-context submission', () => {
  const seeded: BookSeed = {
    organizations: [{ id: 'org_1' }],
    memberships: [{ organizationId: 'org_1', customerId: 'cust_1', role: 'staff' }],
  };

  it('refuses to submit for an organization the caller is not a member of', async () => {
    const { service, created } = makeBookService(OFFERS_ON, seeded);
    await expect(
      service.submitOffer(rival, submission({ context: 'organization', organizationId: 'org_1' })),
    ).rejects.toThrow(ForbiddenException);
    expect(created).toHaveLength(0);
  });

  it('refuses membership of a DIFFERENT organization as authorization', async () => {
    const { service } = makeBookService(OFFERS_ON, {
      organizations: [{ id: 'org_1' }, { id: 'org_2' }],
      memberships: [{ organizationId: 'org_2', customerId: 'cust_1', role: 'owner' }],
    });
    await expect(
      service.submitOffer(buyer, submission({ context: 'organization', organizationId: 'org_1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does not leak organization existence to a non-member (403, not 404)', async () => {
    const { service } = makeBookService(OFFERS_ON, seeded);
    await expect(
      service.submitOffer(rival, submission({ context: 'organization', organizationId: 'nope' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('404s staff on an organization that does not exist', async () => {
    const { service } = makeBookService(OFFERS_ON, seeded);
    await expect(
      service.submitOffer(orgStaff, submission({ context: 'organization', organizationId: 'nope' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses an organization context with no organizationId', async () => {
    const { service } = makeBookService(OFFERS_ON, seeded);
    await expect(service.submitOffer(buyer, submission({ context: 'organization' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses an organizationId smuggled into a personal submission', async () => {
    const { service, created } = makeBookService(OFFERS_ON, seeded);
    await expect(
      service.submitOffer(buyer, submission({ context: 'personal', organizationId: 'org_1' })),
    ).rejects.toThrow(BadRequestException);
    expect(created).toHaveLength(0);
  });

  it('authorizes the organization BEFORE reading the listing at all', async () => {
    // No listing seeded: a permitted caller would fail with NotFound("Listing not found"), so a
    // Forbidden here proves the context gate runs first.
    const { service } = makeBookService(OFFERS_ON, seeded);
    await expect(
      service.submitOffer(rival, submission({ context: 'organization', organizationId: 'org_1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('stamps the organization durably when a member submits for it', async () => {
    const { service, created } = makeBookService(OFFERS_ON, seeded);
    const result = await service.submitOffer(
      buyer,
      submission({ context: 'organization', organizationId: 'org_1' }),
    );
    expect(created[0]?.['buyerOrganizationId']).toBe('org_1');
    // The natural person who submitted stays on the record for audit/KYC.
    expect(created[0]?.['customerId']).toBe('cust_1');
    expect(result).toMatchObject({ context: 'organization' });
  });

  it('leaves a personal submission unattributed, including with no context at all', async () => {
    const { service, created } = makeBookService(OFFERS_ON, seeded);
    await service.submitOffer(buyer, submission());
    expect(created[0]?.['buyerOrganizationId']).toBeNull();
    await service.submitOffer(buyer, {
      listingId: 'l1',
      saleMethodCode: 'MAKE_OFFER',
      proposal,
    } as SubmitOfferInput);
    expect(created[1]?.['buyerOrganizationId']).toBeNull();
  });

  it('refuses a second sealed offer from the same organization (one bid per company)', async () => {
    const { service } = makeBookService(OFFERS_ON, {
      ...seeded,
      memberships: [
        { organizationId: 'org_1', customerId: 'cust_1', role: 'staff' },
        { organizationId: 'org_1', customerId: 'cust_colleague', role: 'admin' },
      ],
      offers: [
        offerRow({ id: 'o_sealed', sealed: true, buyerOrganizationId: 'org_1', customerId: 'cust_1' }),
      ],
    });
    // A DIFFERENT member of the same organization still cannot file a second sealed bid.
    await expect(
      service.submitOffer(
        colleague,
        submission({ sealed: true, context: 'organization', organizationId: 'org_1' }),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('still refuses a second sealed offer from the same natural person (rule unchanged)', async () => {
    const { service } = makeBookService(OFFERS_ON, {
      ...seeded,
      offers: [offerRow({ id: 'o_sealed', sealed: true, customerId: 'cust_1' })],
    });
    await expect(service.submitOffer(buyer, submission({ sealed: true }))).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('OffersService buyer book isolation', () => {
  const seed: BookSeed = {
    organizations: [{ id: 'org_1' }, { id: 'org_2' }],
    memberships: [
      { organizationId: 'org_1', customerId: 'cust_1', role: 'staff' },
      { organizationId: 'org_1', customerId: 'cust_colleague', role: 'admin' },
      { organizationId: 'org_2', customerId: 'cust_rival', role: 'owner' },
    ],
    offers: [
      // Deliberately a status the organization book does NOT contain, so a scoping bug that
      // reverted to "offers this customer submitted" fails loudly rather than coincidentally passing.
      offerRow({ id: 'p1', customerId: 'cust_1', status: 'countered', currency: 'USD' }),
      offerRow({ id: 'o1', customerId: 'cust_1', buyerOrganizationId: 'org_1' }),
      offerRow({ id: 'o2', customerId: 'cust_colleague', buyerOrganizationId: 'org_1' }),
      offerRow({ id: 'x1', customerId: 'cust_rival', buyerOrganizationId: 'org_2' }),
    ],
  };

  it('excludes organization-attributed offers from the personal console', async () => {
    const { service } = makeBookService(OFFERS_ON, seed);
    const result = await service.myOffers(buyer, PERSONAL);
    expect(result.context.kind).toBe('personal');
    expect(result.offers.map((o) => o.id)).toEqual(['p1']);
  });

  it("excludes personal offers from the organization console, and includes a colleague's", async () => {
    const { service } = makeBookService(OFFERS_ON, seed);
    const result = await service.myOffers(buyer, ORG1);
    expect(result.context).toEqual({
      kind: 'organization',
      organizationId: 'org_1',
      role: 'staff',
      viaStaffPermission: false,
    });
    expect(result.offers.map((o) => o.id).sort()).toEqual(['o1', 'o2']);
  });

  it("never returns another organization's offers", async () => {
    const { service } = makeBookService(OFFERS_ON, seed);
    expect((await service.myOffers(rival, ORG2)).offers.map((o) => o.id)).toEqual(['x1']);
    await expect(service.myOffers(rival, ORG1)).rejects.toThrow(ForbiddenException);
  });

  it('refuses an organization console to a non-member and to an anonymous caller', async () => {
    const { service } = makeBookService(OFFERS_ON, seed);
    await expect(service.myOffers(colleague, ORG2)).rejects.toThrow(ForbiddenException);
    await expect(service.myOffers(anonymous, ORG1)).rejects.toThrow(ForbiddenException);
  });

  it('refuses an organizationId smuggled into a personal console read', async () => {
    const { service } = makeBookService(OFFERS_ON, seed);
    await expect(
      service.myOffers(buyer, { context: 'personal', organizationId: 'org_1' } as MyOffersQuery),
    ).rejects.toThrow(BadRequestException);
  });

  it('lets staff with organization:manage read the organization console', async () => {
    const { service } = makeBookService(OFFERS_ON, seed);
    const result = await service.myOffers(orgStaff, ORG1);
    expect(result.context.viaStaffPermission).toBe(true);
    expect(result.offers).toHaveLength(2);
  });
});

describe('OffersService withdraw follows the record’s book', () => {
  const seed: BookSeed = {
    organizations: [{ id: 'org_1' }, { id: 'org_2' }],
    memberships: [
      { organizationId: 'org_1', customerId: 'cust_colleague', role: 'admin' },
      { organizationId: 'org_2', customerId: 'cust_rival', role: 'owner' },
    ],
    offers: [
      offerRow({ id: 'p1', customerId: 'cust_1' }),
      offerRow({ id: 'o1', customerId: 'cust_1', buyerOrganizationId: 'org_1' }),
    ],
  };

  it("lets a colleague withdraw the organization's offer even though they did not file it", async () => {
    const { service, updated } = makeBookService(OFFERS_ON, seed);
    await service.withdrawOffer(colleague, 'o1');
    expect(updated[0]).toMatchObject({ id: 'o1', status: 'withdrawn' });
  });

  it("refuses a member of a DIFFERENT organization", async () => {
    const { service } = makeBookService(OFFERS_ON, seed);
    await expect(service.withdrawOffer(rival, 'o1')).rejects.toThrow(ForbiddenException);
  });

  it('refuses the original submitter once they are no longer a member of the organization', async () => {
    // cust_1 filed o1 for org_1 but holds no membership row in this seed — the organization's
    // book, not the submitter's identity, decides.
    const { service } = makeBookService(OFFERS_ON, seed);
    await expect(service.withdrawOffer(buyer, 'o1')).rejects.toThrow(ForbiddenException);
  });

  it('keeps a personal offer unreachable from any organization membership', async () => {
    const { service } = makeBookService(OFFERS_ON, seed);
    await expect(service.withdrawOffer(colleague, 'p1')).rejects.toThrow(ForbiddenException);
    await expect(service.withdrawOffer(rival, 'p1')).rejects.toThrow(ForbiddenException);
    await expect(service.withdrawOffer(anonymous, 'p1')).rejects.toThrow(ForbiddenException);
  });

  it('still lets the personal owner withdraw their own offer', async () => {
    const { service, updated } = makeBookService(OFFERS_ON, seed);
    await service.withdrawOffer(buyer, 'p1');
    expect(updated[0]).toMatchObject({ id: 'p1', status: 'withdrawn' });
  });

  it('lets organization:manage staff withdraw an organization-attributed offer', async () => {
    const { service, updated } = makeBookService(OFFERS_ON, seed);
    await service.withdrawOffer(orgStaff, 'o1');
    expect(updated[0]).toMatchObject({ id: 'o1', status: 'withdrawn' });
  });
});

describe('OffersService counterparty access is unchanged by buyer attribution', () => {
  // The listing belongs to an individual consignor, so RW5 grants them the 'seller' role.
  const seed: BookSeed = {
    organizations: [{ id: 'org_1' }],
    memberships: [{ organizationId: 'org_1', customerId: 'cust_1', role: 'staff' }],
    asset: { ownerCustomerId: 'seller_owner', sellerOrganizationId: null },
    offers: [
      offerRow({ id: 'p1', customerId: 'cust_1', amountMinor: 300n }),
      offerRow({ id: 'o1', customerId: 'cust_1', buyerOrganizationId: 'org_1', amountMinor: 900n }),
    ],
  };

  it('shows the owning seller BOTH books of offers on their own listing', async () => {
    const { service } = makeBookService(OFFERS_ON, seed);
    const roster = await service.offersForListing(seller, 'l1');
    expect(roster).toMatchObject({ listingId: 'l1', sealed: false });
    const ids = (roster as { offers: { id: string }[] }).offers.map((o) => o.id).sort();
    // A seller answers every offer on their listing — which buyer book it was filed in is not
    // their concern, and hiding the organization's bid would break the negotiation.
    expect(ids).toEqual(['o1', 'p1']);
  });

  it('shows a platform operator both books too', async () => {
    const { service } = makeBookService(OFFERS_ON, seed);
    const roster = await service.offersForListing(operator, 'l1');
    expect((roster as { offers: { id: string }[] }).offers).toHaveLength(2);
  });

  it('still refuses a competing buyer the roster, whichever book they bid from', async () => {
    const { service } = makeBookService(OFFERS_ON, {
      ...seed,
      asset: { ownerCustomerId: 'someone_else', sellerOrganizationId: null },
    });
    await expect(service.offersForListing(buyer, 'l1')).rejects.toThrow(ForbiddenException);
    await expect(service.offersForListing(colleague, 'l1')).rejects.toThrow(ForbiddenException);
  });

  it('does not let the buying organization reach the seller-side roster', async () => {
    // org_1 filed o1, but the listing is someone else's — buyer attribution grants no seller rights.
    const { service } = makeBookService(OFFERS_ON, {
      ...seed,
      asset: { ownerCustomerId: 'seller_owner', sellerOrganizationId: 'org_1' },
      memberships: [{ organizationId: 'org_1', customerId: 'cust_1', role: 'staff' }],
    });
    // cust_1 is only a 'staff' member of org_1 — RW5 requires owner/admin of the SELLING org.
    await expect(service.offersForListing(buyer, 'l1')).rejects.toThrow(ForbiddenException);
  });
});
