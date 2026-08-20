/**
 * Dashboard / Cockpit + Control Centre projections (Evolution E11, pack doc 11 §Dashboard/Control
 * Centre). PURE shaping logic for two read-only command centres: a member's cross-domain activity
 * cockpit and an operator/admin overview. These are **derived projections** — they never own
 * authoritative data; the source records live in their own domains.
 *
 * The cockpit is always rendered *in one explicit context* — either the caller acting personally or
 * the caller acting for one organization (see {@link DashboardContextDescriptor}). The two never
 * blend: a section that has no attribution in the active context reports empty and says so in
 * `scope.notes`, rather than quietly falling back to the other context's records.
 *
 * Every monetary figure is a {@link MoneyByCurrency} aggregate grouped by contractual currency.
 * There is no cross-currency scalar anywhere in this projection.
 */

import { type MoneyByCurrency, emptyMoneyByCurrency } from '../../kernel/currency-totals';

export interface StatusCount {
  status: string;
  count: number;
}

/** A count bucket keyed by an arbitrary stable label (sale channel, lifecycle, …). */
export interface LabelCount {
  label: string;
  count: number;
}

/** Count labels, returned sorted by label for a stable projection. */
export function countByLabel(labels: readonly string[]): LabelCount[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([label, count]) => ({ label, count }));
}

/** Count rows by their `status`, returned sorted by status for a stable projection. */
export function countByStatus(rows: readonly { status: string }[]): StatusCount[] {
  return countByLabel(rows.map((row) => row.status)).map(({ label, count }) => ({
    status: label,
    count,
  }));
}

/** Which principal-scope the cockpit was built for. `personal` and `organization` are disjoint. */
export type DashboardContextKind = 'personal' | 'organization';

/**
 * The resolved, server-authorized context echoed back to the caller so a client can never be in
 * doubt about whose records it is showing. `role` is the caller's membership role in the
 * organization; `viaStaffPermission` marks a staff read that is authorized by an explicit
 * platform grant rather than by membership.
 */
export interface DashboardContextDescriptor {
  kind: DashboardContextKind;
  customerId: string | null;
  organizationId: string | null;
  role: string | null;
  viaStaffPermission: boolean;
}

/** Rows the cockpit aggregates. All optional except `context` so call sites stay additive. */
export interface DashboardInput {
  context: DashboardContextDescriptor;
  watching?: number;
  offers?: readonly { status: string }[];
  procurementRequests?: readonly { status: string }[];
  supplyProgrammes?: readonly { status: string }[];
  procurementResponses?: readonly { status: string }[];
  capabilities?: readonly { status: string }[];
  /** Assets consigned in the active context (personal consignments, or the organization's). */
  consignments?: readonly { status: string }[];
  /** Sales the active context is the SELLER of. */
  sellingSales?: readonly { channel: string }[];
  /** Sales the active context is the BUYER of. */
  purchases?: readonly { channel: string }[];
  /** Invoices raised against the active context as buyer. */
  invoices?: readonly { status: string }[];
  money?: {
    buying?: {
      openOffers?: MoneyByCurrency;
      purchases?: MoneyByCurrency;
      invoicesOutstanding?: MoneyByCurrency;
    };
    selling?: { sales?: MoneyByCurrency };
  };
  /** Human-readable explanations of why a section is empty in this context. */
  notes?: readonly string[];
}

function section(rows: readonly { status: string }[] = []) {
  return { total: rows.length, byStatus: countByStatus(rows) };
}

function channelSection(rows: readonly { channel: string }[] = []) {
  return { total: rows.length, byChannel: countByLabel(rows.map((row) => row.channel)) };
}

/**
 * Assemble the cockpit (Buying / Selling / Verification + currency-grouped money) for one
 * explicit context. The section shape is identical in both contexts so the API contract is stable;
 * what differs is only which records the caller was authorized to have fetched.
 */
export function buildDashboard(input: DashboardInput) {
  const money = input.money ?? {};
  return {
    context: input.context,
    buying: {
      watching: input.watching ?? 0,
      offers: section(input.offers),
      procurementRequests: section(input.procurementRequests),
      purchases: channelSection(input.purchases),
      invoices: section(input.invoices),
    },
    selling: {
      supplyProgrammes: section(input.supplyProgrammes),
      procurementResponses: section(input.procurementResponses),
      consignments: section(input.consignments),
      sales: channelSection(input.sellingSales),
    },
    verification: section(input.capabilities),
    // Money is NEVER a single scalar — each entry is grouped by contractual currency.
    money: {
      buying: {
        openOffers: money.buying?.openOffers ?? emptyMoneyByCurrency(),
        purchases: money.buying?.purchases ?? emptyMoneyByCurrency(),
        invoicesOutstanding: money.buying?.invoicesOutstanding ?? emptyMoneyByCurrency(),
      },
      selling: {
        sales: money.selling?.sales ?? emptyMoneyByCurrency(),
      },
    },
    scope: {
      personalRecordsIncluded: input.context.kind === 'personal',
      organizationRecordsIncluded: input.context.kind === 'organization',
      notes: [...(input.notes ?? [])],
    },
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
