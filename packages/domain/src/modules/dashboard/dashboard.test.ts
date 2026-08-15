import { describe, expect, it } from 'vitest';
import { buildDashboard, controlCentreAlerts, countByStatus } from './dashboard';

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

describe('buildDashboard', () => {
  it('assembles buying / selling / verification sections with totals', () => {
    const d = buildDashboard({
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
