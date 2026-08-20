import { describe, expect, it } from 'vitest';
import {
  type DashboardContextDescriptor,
  buildDashboard,
  controlCentreAlerts,
  countByLabel,
  countByStatus,
} from './dashboard';
import { totalsByCurrency } from '../../kernel/currency-totals';

const personal: DashboardContextDescriptor = {
  kind: 'personal',
  customerId: 'cust_1',
  organizationId: null,
  role: null,
  viaStaffPermission: false,
};
const organization: DashboardContextDescriptor = {
  kind: 'organization',
  customerId: 'cust_1',
  organizationId: 'org_1',
  role: 'owner',
  viaStaffPermission: false,
};

describe('countByStatus', () => {
  it('groups rows by status, sorted stably', () => {
    expect(countByStatus([{ status: 'open' }, { status: 'awarded' }, { status: 'open' }])).toEqual([
      { status: 'awarded', count: 1 },
      { status: 'open', count: 2 },
    ]);
  });

  it('is empty for no rows', () => {
    expect(countByStatus([])).toEqual([]);
  });
});

describe('countByLabel', () => {
  it('groups arbitrary labels, sorted stably', () => {
    expect(countByLabel(['live', 'auction', 'live'])).toEqual([
      { label: 'auction', count: 1 },
      { label: 'live', count: 2 },
    ]);
  });
});

describe('buildDashboard', () => {
  it('assembles buying / selling / verification sections with totals', () => {
    const d = buildDashboard({
      context: personal,
      watching: 3,
      offers: [{ status: 'open' }],
      procurementRequests: [{ status: 'open' }, { status: 'awarded' }],
      supplyProgrammes: [{ status: 'active' }],
      procurementResponses: [],
      capabilities: [{ status: 'verified' }, { status: 'pending' }],
    });
    expect(d.buying.watching).toBe(3);
    expect(d.buying.procurementRequests.total).toBe(2);
    expect(d.selling.supplyProgrammes.total).toBe(1);
    expect(d.selling.procurementResponses.total).toBe(0);
    expect(d.verification.total).toBe(2);
    expect(d.verification.byStatus).toEqual([
      { status: 'pending', count: 1 },
      { status: 'verified', count: 1 },
    ]);
  });

  it('echoes the resolved context and marks which book of record it drew from', () => {
    expect(buildDashboard({ context: personal }).scope).toEqual({
      personalRecordsIncluded: true,
      organizationRecordsIncluded: false,
      notes: [],
    });
    const org = buildDashboard({ context: organization, notes: ['buying is personal'] });
    expect(org.context).toEqual(organization);
    expect(org.scope.personalRecordsIncluded).toBe(false);
    expect(org.scope.organizationRecordsIncluded).toBe(true);
    expect(org.scope.notes).toEqual(['buying is personal']);
  });

  it('exposes no cross-currency scalar anywhere in the money projection', () => {
    const d = buildDashboard({
      context: personal,
      money: {
        selling: {
          sales: totalsByCurrency([
            { currency: 'USD', amountMinor: 100 },
            { currency: 'LKR', amountMinor: 200 },
          ]),
        },
      },
    });
    for (const aggregate of [
      d.money.buying.openOffers,
      d.money.buying.purchases,
      d.money.buying.invoicesOutstanding,
      d.money.selling.sales,
    ]) {
      expect(Object.keys(aggregate).sort()).toEqual(['byCurrency', 'count', 'currencies']);
      expect(aggregate).not.toHaveProperty('totalMinor');
      expect(aggregate).not.toHaveProperty('total');
    }
    expect(d.money.selling.sales.byCurrency).toEqual([
      { currency: 'LKR', totalMinor: 200, count: 1 },
      { currency: 'USD', totalMinor: 100, count: 1 },
    ]);
  });

  it('defaults every section to empty so a context with no attribution never borrows rows', () => {
    const d = buildDashboard({ context: organization });
    expect(d.buying).toEqual({
      watching: 0,
      offers: { total: 0, byStatus: [] },
      procurementRequests: { total: 0, byStatus: [] },
      purchases: { total: 0, byChannel: [] },
      invoices: { total: 0, byStatus: [] },
    });
    expect(d.verification).toEqual({ total: 0, byStatus: [] });
    expect(d.money.buying.openOffers).toEqual({ byCurrency: [], currencies: [], count: 0 });
  });
});

describe('controlCentreAlerts', () => {
  const base = {
    operators: 2,
    markets: 1,
    routingRules: 0,
    feeRules: 0,
    paymentRoutes: 0,
    supplyProgrammes: 0,
    procurementRequests: 0,
    pendingVerifications: 0,
  };

  it('is quiet when nothing needs attention', () => {
    expect(controlCentreAlerts(base)).toEqual([]);
  });

  it('flags pending verifications and missing operators/markets', () => {
    expect(controlCentreAlerts({ ...base, pendingVerifications: 4 })[0]).toContain('4 capability');
    expect(controlCentreAlerts({ ...base, operators: 0, markets: 0 })).toEqual([
      'no operators configured',
      'no markets configured',
    ]);
  });
});
