/**
 * Dashboard + Control Centre projections (Evolution E11, pack doc 11 §Dashboard/Control Centre).
 * PURE shaping logic for two read-only command centres: a member's cross-domain activity dashboard
 * and an operator/admin overview. These are **derived projections** — they never own authoritative
 * data; the source records live in their own domains.
 */

export interface StatusCount {
  status: string;
  count: number;
}

/** Count rows by their `status`, returned sorted by status for a stable projection. */
export function countByStatus(rows: readonly { status: string }[]): StatusCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([status, count]) => ({ status, count }));
}

export interface DashboardInput {
  watching: number;
  offers: readonly { status: string }[];
  procurementRequests: readonly { status: string }[];
  supplyProgrammes: readonly { status: string }[];
  procurementResponses: readonly { status: string }[];
  capabilities: readonly { status: string }[];
}

/** Assemble the member's unified dashboard (Buying / Selling / Verification) from fetched rows. */
export function buildDashboard(input: DashboardInput) {
  const section = (rows: readonly { status: string }[]) => ({
    total: rows.length,
    byStatus: countByStatus(rows),
  });
  return {
    buying: {
      watching: input.watching,
      offers: section(input.offers),
      procurementRequests: section(input.procurementRequests),
    },
    selling: {
      supplyProgrammes: section(input.supplyProgrammes),
      procurementResponses: section(input.procurementResponses),
    },
    verification: section(input.capabilities),
  };
}

export interface ControlCentreCounts {
  operators: number;
  markets: number;
  routingRules: number;
  feeRules: number;
  paymentRoutes: number;
  supplyProgrammes: number;
  procurementRequests: number;
  pendingVerifications: number;
}

/** Surface attention items an operator should act on — pending KYC, missing config. */
export function controlCentreAlerts(c: ControlCentreCounts): string[] {
  const alerts: string[] = [];
  if (c.pendingVerifications > 0) {
    alerts.push(`${c.pendingVerifications} capability verification(s) pending`);
  }
  if (c.operators === 0) alerts.push('no operators configured');
  if (c.markets === 0) alerts.push('no markets configured');
  return alerts;
}
