import { describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  type CreateProcurementRequestInput,
  Permission,
  type ProcurementRequestsQuery,
} from '@singha/contracts';
import { ProcurementService } from './procurement.service';
import { type AppConfigService } from '../../config/config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type Principal } from '../../shared/auth/principal';

type Features = Record<string, boolean>;

const ON: Features = { procurement: true };

const buyer: Principal = { customerId: 'cust_1', roles: [], permissions: new Set(), aal: 'aal1' };
const colleague: Principal = {
  customerId: 'cust_colleague',
  roles: [],
  permissions: new Set(),
  aal: 'aal1',
};
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

const PERSONAL: ProcurementRequestsQuery = { context: 'personal' };
const ORG1: ProcurementRequestsQuery = { context: 'organization', organizationId: 'org_1' };
const ORG2: ProcurementRequestsQuery = { context: 'organization', organizationId: 'org_2' };

const rfq = (over: Partial<CreateProcurementRequestInput> = {}): CreateProcurementRequestInput => ({
  type: 'RFQ',
  title: 'Need widgets',
  currency: 'LKR',
  context: 'personal',
  ...over,
});

interface RequestRow {
  id: string;
  type: string;
  status: string;
  title: string;
  buyerCustomerId: string | null;
  buyerOrganizationId: string | null;
  createdAt: Date;
}

interface Seed {
  organizations?: { id: string }[];
  memberships?: { organizationId: string; customerId: string; role: string }[];
  requests?: RequestRow[];
}

type Row = Record<string, unknown>;

function matches(row: Row, where: Row | undefined): boolean {
  for (const [key, expected] of Object.entries(where ?? {})) {
    if (row[key] !== expected) return false;
  }
  return true;
}

const request = (over: Partial<RequestRow> = {}): RequestRow => ({
  id: 'req_seed',
  type: 'RFQ',
  status: 'open',
  title: 'seeded',
  buyerCustomerId: 'cust_1',
  buyerOrganizationId: null,
  createdAt: new Date('2026-08-20T00:00:00.000Z'),
  ...over,
});

/**
 * In-memory stand-in for the tables procurement touches. `findMany` applies the service's REAL
 * `where` clause, so the isolation tests below prove the scoping rather than merely asserting a
 * mock was called: drop `buyerOrganizationId: null` from the personal filter and the personal list
 * immediately starts returning the organization's rows.
 */
function makeService(features: Features = ON, seed: Seed = {}) {
  const requests = [...(seed.requests ?? [])];
  const created: Row[] = [];
  const prisma = {
    organization: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve((seed.organizations ?? []).find((o) => o.id === where.id) ?? null),
    },
    organizationMember: {
      findFirst: ({ where }: { where: Row }) =>
        Promise.resolve((seed.memberships ?? []).find((m) => matches(m, where)) ?? null),
    },
    procurementRequest: {
      findMany: ({ where }: { where?: Row } = {}) =>
        Promise.resolve(requests.filter((r) => matches(r as unknown as Row, where))),
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(requests.find((r) => r.id === where.id) ?? null),
    },
    procurementProposal: { findMany: () => Promise.resolve([]) },
  } as unknown as PrismaService;
  const uow = {
    execute: (_actor: unknown, fn: (ctx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          tx: {
            procurementRequest: {
              create: ({ data }: { data: Row }) => {
                created.push(data);
                return Promise.resolve(data);
              },
            },
          },
          audit: () => undefined,
        }),
      ),
  } as unknown as UnitOfWork;
  const config = { get: () => ({ features }) } as unknown as AppConfigService;
  return { service: new ProcurementService(prisma, uow, config), created };
}

describe('ProcurementService (E9 flag gating)', () => {
  it('404s the whole surface when procurement is OFF', async () => {
    const { service } = makeService({ procurement: false });
    await expect(service.createRequest(buyer, rfq())).rejects.toThrow(NotFoundException);
    await expect(
      service.submitProposal(buyer, 'r1', { proposal: { currency: 'LKR', totalPriceMinor: 100 } }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.award(buyer, 'r1', { selectedProposalId: 'p1' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.myRequests(buyer, PERSONAL)).rejects.toThrow(NotFoundException);
  });

  it('checks the flag before touching the organization context at all', async () => {
    const { service } = makeService({ procurement: false });
    await expect(
      service.createRequest(buyer, rfq({ context: 'organization', organizationId: 'org_1' })),
    ).rejects.toThrow(NotFoundException);
    await expect(service.myRequests(buyer, ORG1)).rejects.toThrow(NotFoundException);
  });
});

describe('ProcurementService organization-context creation', () => {
  const seeded: Seed = {
    organizations: [{ id: 'org_1' }],
    memberships: [{ organizationId: 'org_1', customerId: 'cust_1', role: 'staff' }],
  };

  it('refuses to create for an organization the caller is not a member of', async () => {
    const { service, created } = makeService(ON, seeded);
    await expect(
      service.createRequest(outsider, rfq({ context: 'organization', organizationId: 'org_1' })),
    ).rejects.toThrow(ForbiddenException);
    expect(created).toHaveLength(0);
  });

  it('refuses membership of a DIFFERENT organization as authorization', async () => {
    const { service } = makeService(ON, {
      organizations: [{ id: 'org_1' }, { id: 'org_2' }],
      memberships: [{ organizationId: 'org_2', customerId: 'cust_1', role: 'owner' }],
    });
    await expect(
      service.createRequest(buyer, rfq({ context: 'organization', organizationId: 'org_1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does not leak organization existence to a non-member (403, not 404)', async () => {
    const { service } = makeService(ON, seeded);
    await expect(
      service.createRequest(outsider, rfq({ context: 'organization', organizationId: 'nope' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('404s staff on an organization that does not exist', async () => {
    const { service } = makeService(ON, seeded);
    await expect(
      service.createRequest(orgStaff, rfq({ context: 'organization', organizationId: 'nope' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses an organization context with no organizationId', async () => {
    const { service } = makeService(ON, seeded);
    await expect(service.createRequest(buyer, rfq({ context: 'organization' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses an organizationId smuggled into a personal creation', async () => {
    const { service, created } = makeService(ON, seeded);
    await expect(
      service.createRequest(buyer, rfq({ context: 'personal', organizationId: 'org_1' })),
    ).rejects.toThrow(BadRequestException);
    expect(created).toHaveLength(0);
  });

  it('stamps the organization durably when a member creates for it', async () => {
    const { service, created } = makeService(ON, seeded);
    const result = await service.createRequest(
      buyer,
      rfq({ context: 'organization', organizationId: 'org_1' }),
    );
    expect(created[0]?.['buyerOrganizationId']).toBe('org_1');
    // The poster of record is still captured, so the audit trail keeps who acted.
    expect(created[0]?.['buyerCustomerId']).toBe('cust_1');
    expect(result.context).toBe('organization');
  });

  it('leaves a personal creation unattributed', async () => {
    const { service, created } = makeService(ON, seeded);
    const result = await service.createRequest(buyer, rfq());
    expect(created[0]?.['buyerOrganizationId']).toBeNull();
    expect(result.context).toBe('personal');
  });

  it('defaults to the personal book when no context is supplied', async () => {
    const { service, created } = makeService(ON, seeded);
    await service.createRequest(buyer, {
      type: 'RFQ',
      title: 'no context given',
      currency: 'LKR',
    } as CreateProcurementRequestInput);
    expect(created[0]?.['buyerOrganizationId']).toBeNull();
  });

  it('requires an authenticated customer', async () => {
    const { service } = makeService(ON, seeded);
    await expect(service.createRequest(anonymous, rfq())).rejects.toThrow(ForbiddenException);
  });
});

describe('ProcurementService book isolation', () => {
  // cust_1 belongs to org_1; cust_colleague belongs to org_1 too; org_2 is unrelated.
  const seed: Seed = {
    organizations: [{ id: 'org_1' }, { id: 'org_2' }],
    memberships: [
      { organizationId: 'org_1', customerId: 'cust_1', role: 'staff' },
      { organizationId: 'org_1', customerId: 'cust_colleague', role: 'admin' },
      { organizationId: 'org_2', customerId: 'cust_outsider', role: 'owner' },
    ],
    requests: [
      request({ id: 'p1', title: 'personal of cust_1', buyerCustomerId: 'cust_1' }),
      request({
        id: 'o1',
        title: 'org_1 via cust_1',
        buyerCustomerId: 'cust_1',
        buyerOrganizationId: 'org_1',
      }),
      request({
        id: 'o2',
        title: 'org_1 via colleague',
        buyerCustomerId: 'cust_colleague',
        buyerOrganizationId: 'org_1',
      }),
      request({
        id: 'x1',
        title: 'org_2 request',
        buyerCustomerId: 'cust_outsider',
        buyerOrganizationId: 'org_2',
      }),
    ],
  };

  it('excludes organization-attributed requests from the personal list', async () => {
    const { service } = makeService(ON, seed);
    const result = await service.myRequests(buyer, PERSONAL);
    expect(result.context.kind).toBe('personal');
    expect(result.requests.map((r) => r.id)).toEqual(['p1']);
  });

  it('excludes personal requests from the organization list, and includes a colleague’s', async () => {
    const { service } = makeService(ON, seed);
    const result = await service.myRequests(buyer, ORG1);
    expect(result.context).toEqual({
      kind: 'organization',
      organizationId: 'org_1',
      role: 'staff',
      viaStaffPermission: false,
    });
    expect(result.requests.map((r) => r.id).sort()).toEqual(['o1', 'o2']);
  });

  it('never returns another organization’s requests', async () => {
    const { service } = makeService(ON, seed);
    const result = await service.myRequests(outsider, ORG2);
    expect(result.requests.map((r) => r.id)).toEqual(['x1']);
    // …and org_2's member cannot read org_1's book at all.
    await expect(service.myRequests(outsider, ORG1)).rejects.toThrow(ForbiddenException);
  });

  it('refuses an organization list to a non-member and to an anonymous caller', async () => {
    const { service } = makeService(ON, seed);
    await expect(service.myRequests(colleague, ORG2)).rejects.toThrow(ForbiddenException);
    await expect(service.myRequests(anonymous, ORG1)).rejects.toThrow(ForbiddenException);
  });

  it('refuses an organizationId smuggled into a personal list', async () => {
    const { service } = makeService(ON, seed);
    await expect(
      service.myRequests(buyer, {
        context: 'personal',
        organizationId: 'org_1',
      } as ProcurementRequestsQuery),
    ).rejects.toThrow(BadRequestException);
  });

  it('lets staff with organization:manage read the organization book', async () => {
    const { service } = makeService(ON, seed);
    const result = await service.myRequests(orgStaff, ORG1);
    expect(result.context.viaStaffPermission).toBe(true);
    expect(result.requests).toHaveLength(2);
  });
});

describe('ProcurementService management authorization follows the record’s book', () => {
  const seed: Seed = {
    organizations: [{ id: 'org_1' }, { id: 'org_2' }],
    memberships: [
      { organizationId: 'org_1', customerId: 'cust_colleague', role: 'admin' },
      { organizationId: 'org_2', customerId: 'cust_outsider', role: 'owner' },
    ],
    requests: [
      request({ id: 'p1', buyerCustomerId: 'cust_1' }),
      request({ id: 'o1', buyerCustomerId: 'cust_1', buyerOrganizationId: 'org_1' }),
    ],
  };

  it('lets a colleague manage the organization’s request even though they did not post it', async () => {
    const { service } = makeService(ON, seed);
    const result = await service.proposalsForRequest(colleague, 'o1');
    expect(result.requestId).toBe('o1');
  });

  it('lets organization:manage staff manage an organization-attributed request', async () => {
    const { service } = makeService(ON, seed);
    expect((await service.proposalsForRequest(orgStaff, 'o1')).requestId).toBe('o1');
  });

  it('still lets the personal owner manage their own request', async () => {
    const { service } = makeService(ON, seed);
    expect((await service.proposalsForRequest(buyer, 'p1')).requestId).toBe('p1');
  });

  it('refuses a member of a DIFFERENT organization', async () => {
    const { service } = makeService(ON, seed);
    await expect(service.proposalsForRequest(outsider, 'o1')).rejects.toThrow(ForbiddenException);
  });

  it('refuses the original poster once they are no longer a member of the organization', async () => {
    // cust_1 posted o1 for org_1 but holds no membership row in this seed — the organization's
    // book, not the poster's identity, decides.
    const { service } = makeService(ON, seed);
    await expect(service.proposalsForRequest(buyer, 'o1')).rejects.toThrow(ForbiddenException);
  });

  it('keeps a personal request unreachable from any organization membership', async () => {
    const { service } = makeService(ON, seed);
    await expect(service.proposalsForRequest(colleague, 'p1')).rejects.toThrow(ForbiddenException);
    await expect(service.proposalsForRequest(outsider, 'p1')).rejects.toThrow(ForbiddenException);
    await expect(service.proposalsForRequest(anonymous, 'p1')).rejects.toThrow(ForbiddenException);
  });

  it('404s an unknown request', async () => {
    const { service } = makeService(ON, seed);
    await expect(service.proposalsForRequest(buyer, 'missing')).rejects.toThrow(NotFoundException);
  });
});
