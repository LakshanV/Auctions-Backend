import { describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { type DashboardQuery, Permission } from '@singha/contracts';
import { DashboardService } from './dashboard.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type Principal } from '../../shared/auth/principal';

type Features = Record<string, boolean>;

const ALL_ON: Features = { dashboard: true, controlCentre: true };

const member: Principal = { customerId: 'cust_1', roles: [], permissions: new Set(), aal: 'aal1' };
const outsider: Principal = {
  customerId: 'cust_outsider',
  roles: [],
  permissions: new Set(),
  aal: 'aal1',
};
const anonymous: Principal = { customerId: null, roles: [], permissions: new Set(), aal: 'aal1' };
const orgStaff: Principal = {
  customerId: 'staff_1',
  roles: [],
  permissions: new Set([Permission.OrganizationManage]),
  aal: 'aal1',
};

const PERSONAL: DashboardQuery = { context: 'personal' };
const ORG: DashboardQuery = { context: 'organization', organizationId: 'org_1' };

/**
 * A tiny in-memory stand-in for the tables the cockpit reads. It applies the service's real `where`
 * clauses, so the leakage tests below prove the *scoping*, not just that a mock was called — a
 * service that dropped `sellerOrganizationId: null` would immediately return the org rows here.
 */
interface Seed {
  organizations?: { id: string }[];
  memberships?: { organizationId: string; customerId: string; role: string }[];
  watches?: { customerId: string }[];
  offers?: { customerId: string; status: string; amountMinor: bigint; currency: string }[];
  procurementRequests?: { buyerCustomerId: string; status: string }[];
  supplyProgrammes?: { supplierCustomerId: string; status: string }[];
  procurementProposals?: { supplierCustomerId: string; status: string }[];
  capabilities?: {
    customerId: string;
    capability: string;
    status: string;
    expiresAt: Date | null;
  }[];
  assets?: {
    ownerCustomerId: string | null;
    sellerOrganizationId: string | null;
    lifecycle: string;
  }[];
  sales?: {
    buyerCustomerId: string;
    sellerOrganizationId: string | null;
    assetOwnerCustomerId: string | null;
    channel: string;
    amountMinor: bigint;
    currency: string;
  }[];
  invoices?: {
    buyerCustomerId: string;
    status: string;
    amountDueMinor: bigint;
    currency: string;
  }[];
}

type Row = Record<string, unknown>;

function matches(row: Row, where: Row | undefined): boolean {
  for (const [key, expected] of Object.entries(where ?? {})) {
    if (row[key] !== expected) return false;
  }
  return true;
}

const table = <T extends Row>(rows: readonly T[]) => ({
  findMany: ({ where }: { where?: Row } = {}) =>
    Promise.resolve(rows.filter((r) => matches(r, where))),
  count: ({ where }: { where?: Row } = {}) =>
    Promise.resolve(rows.filter((r) => matches(r, where)).length),
});

function makeService(features: Features = ALL_ON, seed: Seed = {}): DashboardService {
  const sales = seed.sales ?? [];
  const prisma = {
    organization: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve((seed.organizations ?? []).find((o) => o.id === where.id) ?? null),
    },
    organizationMember: {
      findFirst: ({ where }: { where: Row }) =>
        Promise.resolve((seed.memberships ?? []).find((m) => matches(m, where)) ?? null),
    },
    watch: table(seed.watches ?? []),
    offer: table(seed.offers ?? []),
    procurementRequest: table(seed.procurementRequests ?? []),
    supplyProgramme: table(seed.supplyProgrammes ?? []),
    procurementProposal: table(seed.procurementProposals ?? []),
    customerCapability: table(seed.capabilities ?? []),
    asset: table(seed.assets ?? []),
    invoice: table(seed.invoices ?? []),
    sale: {
      // Mirrors the three shapes the service issues: buyer-scoped, personal-selling
      // (no org attribution + asset owned by the caller) and organization-selling.
      findMany: ({ where }: { where: Row }) => {
        const ownerFilter = (
          where['listing'] as { asset?: { ownerCustomerId?: string } } | undefined
        )?.asset?.ownerCustomerId;
        return Promise.resolve(
          sales.filter((s) => {
            if ('buyerCustomerId' in where && s.buyerCustomerId !== where['buyerCustomerId']) {
              return false;
            }
            if (
              'sellerOrganizationId' in where &&
              s.sellerOrganizationId !== where['sellerOrganizationId']
            ) {
              return false;
            }
            if (ownerFilter !== undefined && s.assetOwnerCustomerId !== ownerFilter) return false;
            return true;
          }),
        );
      },
    },
  } as unknown as PrismaService;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return new DashboardService(prisma, config);
}

describe('DashboardService (E11b flag gating)', () => {
  it('404s the dashboard when the flag is OFF', async () => {
    const s = makeService({ dashboard: false, controlCentre: true });
    await expect(s.getDashboard(member, PERSONAL)).rejects.toThrow(NotFoundException);
  });

  it('404s the control centre when the flag is OFF', async () => {
    const s = makeService({ dashboard: true, controlCentre: false });
    await expect(s.getControlCentreOverview(member)).rejects.toThrow(NotFoundException);
  });

  it('checks the flag before touching the organization context at all', async () => {
    const s = makeService({ dashboard: false, controlCentre: true });
    await expect(s.getDashboard(member, ORG)).rejects.toThrow(NotFoundException);
  });
});

describe('DashboardService context authorization', () => {
  const seeded: Seed = {
    organizations: [{ id: 'org_1' }],
    memberships: [{ organizationId: 'org_1', customerId: 'cust_1', role: 'owner' }],
  };

  it('rejects an organization context the caller is not a member of', async () => {
    const s = makeService(ALL_ON, seeded);
    await expect(
      s.getDashboard(outsider, { context: 'organization', organizationId: 'org_1' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects an organization context for an anonymous caller', async () => {
    const s = makeService(ALL_ON, seeded);
    await expect(s.getDashboard(anonymous, ORG)).rejects.toThrow(ForbiddenException);
  });

  it('does not leak organization existence to a non-member (403, not 404)', async () => {
    const s = makeService(ALL_ON, seeded);
    await expect(
      s.getDashboard(outsider, { context: 'organization', organizationId: 'org_does_not_exist' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses membership of a DIFFERENT organization as authorization', async () => {
    const s = makeService(ALL_ON, {
      organizations: [{ id: 'org_1' }, { id: 'org_2' }],
      memberships: [{ organizationId: 'org_2', customerId: 'cust_1', role: 'owner' }],
    });
    await expect(s.getDashboard(member, ORG)).rejects.toThrow(ForbiddenException);
  });

  it('admits a member and echoes the resolved context with their role', async () => {
    const s = makeService(ALL_ON, seeded);
    const d = await s.getDashboard(member, ORG);
    expect(d.context).toEqual({
      kind: 'organization',
      customerId: 'cust_1',
      organizationId: 'org_1',
      role: 'owner',
      viaStaffPermission: false,
    });
    expect(d.scope.organizationRecordsIncluded).toBe(true);
  });

  it('admits staff holding organization:manage and marks the read as permission-based', async () => {
    const s = makeService(ALL_ON, seeded);
    const d = await s.getDashboard(orgStaff, ORG);
    expect(d.context.viaStaffPermission).toBe(true);
    expect(d.context.role).toBeNull();
  });

  it('404s staff on an organization that does not exist', async () => {
    const s = makeService(ALL_ON, seeded);
    await expect(
      s.getDashboard(orgStaff, { context: 'organization', organizationId: 'nope' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('requires an authenticated customer for the personal context', async () => {
    const s = makeService(ALL_ON, seeded);
    await expect(s.getDashboard(anonymous, PERSONAL)).rejects.toThrow(ForbiddenException);
  });

  it('refuses an organization id smuggled into a personal context at the service layer', async () => {
    const s = makeService(ALL_ON, seeded);
    await expect(
      s.getDashboard(member, { context: 'personal', organizationId: 'org_1' } as DashboardQuery),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an organization context with no organization id', async () => {
    const s = makeService(ALL_ON, seeded);
    await expect(
      s.getDashboard(member, { context: 'organization' } as DashboardQuery),
    ).rejects.toThrow(BadRequestException);
  });

  it('defaults to the personal context when no query is supplied', async () => {
    const s = makeService(ALL_ON, seeded);
    expect((await s.getDashboard(member)).context.kind).toBe('personal');
  });
});

describe('DashboardService personal / organization isolation', () => {
  // cust_1 owns one personal consignment and one consigned under org_1, and has private
  // buy-side + verification activity. org_1 also holds a consignment from another member.
  const seed: Seed = {
    organizations: [{ id: 'org_1' }],
    memberships: [{ organizationId: 'org_1', customerId: 'cust_1', role: 'admin' }],
    watches: [{ customerId: 'cust_1' }, { customerId: 'cust_other' }],
    offers: [
      { customerId: 'cust_1', status: 'open', amountMinor: 500n, currency: 'USD' },
      { customerId: 'cust_other', status: 'open', amountMinor: 900n, currency: 'USD' },
    ],
    procurementRequests: [{ buyerCustomerId: 'cust_1', status: 'open' }],
    supplyProgrammes: [{ supplierCustomerId: 'cust_1', status: 'active' }],
    procurementProposals: [{ supplierCustomerId: 'cust_1', status: 'open' }],
    capabilities: [
      { customerId: 'cust_1', capability: 'place_bid', status: 'pending', expiresAt: null },
      { customerId: 'cust_other', capability: 'sell', status: 'verified', expiresAt: null },
    ],
    assets: [
      { ownerCustomerId: 'cust_1', sellerOrganizationId: null, lifecycle: 'available' },
      { ownerCustomerId: 'cust_1', sellerOrganizationId: 'org_1', lifecycle: 'sold' },
      { ownerCustomerId: 'cust_colleague', sellerOrganizationId: 'org_1', lifecycle: 'draft' },
    ],
    sales: [
      {
        buyerCustomerId: 'buyer_x',
        sellerOrganizationId: null,
        assetOwnerCustomerId: 'cust_1',
        channel: 'auction',
        amountMinor: 1_000n,
        currency: 'LKR',
      },
      {
        buyerCustomerId: 'buyer_y',
        sellerOrganizationId: 'org_1',
        assetOwnerCustomerId: 'cust_1',
        channel: 'buy_now',
        amountMinor: 7_000n,
        currency: 'USD',
      },
      {
        buyerCustomerId: 'cust_1',
        sellerOrganizationId: null,
        assetOwnerCustomerId: 'seller_z',
        channel: 'live',
        amountMinor: 300n,
        currency: 'AUD',
      },
    ],
    invoices: [
      { buyerCustomerId: 'cust_1', status: 'issued', amountDueMinor: 4_000n, currency: 'AUD' },
      { buyerCustomerId: 'cust_other', status: 'issued', amountDueMinor: 8_000n, currency: 'AUD' },
    ],
  };

  it('keeps organization-consigned assets and sales out of the personal cockpit', async () => {
    const d = await makeService(ALL_ON, seed).getDashboard(member, PERSONAL);
    // Only the consignment with NO organization attribution belongs to the personal book.
    expect(d.selling.consignments).toEqual({
      total: 1,
      byStatus: [{ status: 'available', count: 1 }],
    });
    expect(d.selling.sales).toEqual({ total: 1, byChannel: [{ label: 'auction', count: 1 }] });
    // The org sale (USD 7,000) must not appear in the member's personal selling money.
    expect(d.money.selling.sales.byCurrency).toEqual([
      { currency: 'LKR', totalMinor: 1_000, count: 1 },
    ]);
  });

  it('keeps personal buy-side, supply and verification records out of the organization cockpit', async () => {
    const d = await makeService(ALL_ON, seed).getDashboard(member, ORG);
    expect(d.buying).toEqual({
      watching: 0,
      offers: { total: 0, byStatus: [] },
      procurementRequests: { total: 0, byStatus: [] },
      purchases: { total: 0, byChannel: [] },
      invoices: { total: 0, byStatus: [] },
    });
    expect(d.verification).toEqual({ total: 0, byStatus: [] });
    expect(d.selling.supplyProgrammes.total).toBe(0);
    expect(d.selling.procurementResponses.total).toBe(0);
    expect(d.money.buying.openOffers.byCurrency).toEqual([]);
    expect(d.money.buying.invoicesOutstanding.byCurrency).toEqual([]);
    expect(d.scope.notes.length).toBeGreaterThan(0);
  });

  it('shows the organization its own consignments and sales, including a colleague’s', async () => {
    const d = await makeService(ALL_ON, seed).getDashboard(member, ORG);
    expect(d.selling.consignments).toEqual({
      total: 2,
      byStatus: [
        { status: 'draft', count: 1 },
        { status: 'sold', count: 1 },
      ],
    });
    expect(d.selling.sales).toEqual({ total: 1, byChannel: [{ label: 'buy_now', count: 1 }] });
    expect(d.money.selling.sales.byCurrency).toEqual([
      { currency: 'USD', totalMinor: 7_000, count: 1 },
    ]);
  });

  it('scopes every personal section to the caller and never to other customers', async () => {
    const d = await makeService(ALL_ON, seed).getDashboard(member, PERSONAL);
    expect(d.buying.watching).toBe(1);
    expect(d.buying.offers).toEqual({ total: 1, byStatus: [{ status: 'open', count: 1 }] });
    expect(d.buying.procurementRequests.total).toBe(1);
    expect(d.buying.purchases).toEqual({ total: 1, byChannel: [{ label: 'live', count: 1 }] });
    expect(d.buying.invoices.total).toBe(1);
    expect(d.verification).toEqual({ total: 1, byStatus: [{ status: 'pending', count: 1 }] });
    expect(d.money.buying.invoicesOutstanding.byCurrency).toEqual([
      { currency: 'AUD', totalMinor: 4_000, count: 1 },
    ]);
  });

  it('returns nothing but empty sections for a member with no records at all', async () => {
    const d = await makeService(ALL_ON, seed).getDashboard(outsider, PERSONAL);
    expect(d.buying.watching).toBe(0);
    expect(d.selling.consignments.total).toBe(0);
    expect(d.money.buying.purchases).toEqual({ byCurrency: [], currencies: [], count: 0 });
  });
});

describe('DashboardService currency grouping', () => {
  it('never merges unlike currencies into one total', async () => {
    const s = makeService(ALL_ON, {
      offers: [
        { customerId: 'cust_1', status: 'open', amountMinor: 1_000n, currency: 'USD' },
        { customerId: 'cust_1', status: 'countered', amountMinor: 2_500n, currency: 'LKR' },
        { customerId: 'cust_1', status: 'open', amountMinor: 500n, currency: 'USD' },
        // Settled/withdrawn offers are history, not money currently committed.
        { customerId: 'cust_1', status: 'withdrawn', amountMinor: 9_999n, currency: 'USD' },
      ],
      invoices: [
        { buyerCustomerId: 'cust_1', status: 'issued', amountDueMinor: 100n, currency: 'EUR' },
        { buyerCustomerId: 'cust_1', status: 'issued', amountDueMinor: 200n, currency: 'AUD' },
        { buyerCustomerId: 'cust_1', status: 'paid', amountDueMinor: 900n, currency: 'EUR' },
      ],
      sales: [
        {
          buyerCustomerId: 'cust_1',
          sellerOrganizationId: null,
          assetOwnerCustomerId: 'seller_z',
          channel: 'auction',
          amountMinor: 4n,
          currency: 'GBP',
        },
        {
          buyerCustomerId: 'cust_1',
          sellerOrganizationId: null,
          assetOwnerCustomerId: 'seller_z',
          channel: 'auction',
          amountMinor: 6n,
          currency: 'INR',
        },
      ],
    });
    const d = await s.getDashboard(member, PERSONAL);

    expect(d.money.buying.openOffers.byCurrency).toEqual([
      { currency: 'LKR', totalMinor: 2_500, count: 1 },
      { currency: 'USD', totalMinor: 1_500, count: 2 },
    ]);
    expect(d.money.buying.invoicesOutstanding.byCurrency).toEqual([
      { currency: 'AUD', totalMinor: 200, count: 1 },
      { currency: 'EUR', totalMinor: 100, count: 1 },
    ]);
    // GBP 4 + INR 6 is not "10" — the two stay in separate buckets.
    expect(d.money.buying.purchases.byCurrency).toEqual([
      { currency: 'GBP', totalMinor: 4, count: 1 },
      { currency: 'INR', totalMinor: 6, count: 1 },
    ]);
    expect(d.money.buying.purchases.currencies).toEqual(['GBP', 'INR']);
  });

  it('exposes no scalar total on any money aggregate in the response', async () => {
    const d = await makeService(ALL_ON, {
      offers: [{ customerId: 'cust_1', status: 'open', amountMinor: 1n, currency: 'USD' }],
    }).getDashboard(member, PERSONAL);
    const aggregates = [
      d.money.buying.openOffers,
      d.money.buying.purchases,
      d.money.buying.invoicesOutstanding,
      d.money.selling.sales,
    ];
    for (const aggregate of aggregates) {
      expect(Object.keys(aggregate).sort()).toEqual(['byCurrency', 'count', 'currencies']);
    }
  });
});
