import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type DashboardQuery } from '@singha/contracts';
import {
  type CapabilityStatus,
  type DashboardContextDescriptor,
  buildDashboard,
  controlCentreAlerts,
  effectiveCapabilityStatus,
  totalsByCurrency,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { resolveActorContext } from '../../shared/auth/actor-context';
import { type Principal } from '../../shared/auth/principal';

/**
 * Cockpit (Dashboard) + Control Centre service (Evolution E11b, pack doc 11). Two read-only
 * projections: a member's cross-domain command centre and an operator-scoped admin overview. No
 * authoritative data is owned here — every figure is derived from the domain that owns the record.
 * Flag-gated by `dashboard` / `controlCentre`.
 *
 * Two invariants govern the cockpit:
 *
 *  1. **Explicit context authorization.** The caller states whether they are acting personally or
 *     for a named organization. An organization read requires membership in *that* organization
 *     (or the explicit `organization:manage` platform grant) — never inferred from "they belong to
 *     some org". The two contexts are queried from disjoint record sets, so neither leaks into the
 *     other: personal selling reads only rows with NO organization attribution, and an organization
 *     read only reads rows attributed to that organization id.
 *  2. **No cross-currency totals.** Every monetary aggregate is grouped by contractual currency via
 *     `totalsByCurrency`; the projection has no scalar total for a client to render by mistake.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Resolve + AUTHORIZE the requested cockpit context. The rules (personal needs an authenticated
   * customer; organization needs an explicit id the caller is entitled to; a non-member gets 403
   * whether or not the organization exists, so the cockpit is not an organization-existence oracle)
   * live in `shared/auth/actor-context.ts` and are shared with procurement, so the two verticals
   * cannot drift apart on who may act for whom.
   */
  private resolveContext(
    principal: Principal,
    query: DashboardQuery,
  ): Promise<DashboardContextDescriptor> {
    return resolveActorContext(this.prisma, principal, query);
  }

  /** The caller's cockpit for one explicit context (Buying / Selling / Verification + money). */
  async getDashboard(principal: Principal, query: DashboardQuery = { context: 'personal' }) {
    if (!this.config.get().features.dashboard) {
      throw new NotFoundException('Dashboard is not enabled');
    }
    const context = await this.resolveContext(principal, query);
    return context.kind === 'organization'
      ? this.organizationDashboard(context)
      : this.personalDashboard(context);
  }

  /**
   * The individual's cockpit. Selling rows are restricted to consignments with NO organization
   * attribution — an asset consigned under an organization belongs to that organization's book,
   * even when the individual is the asset's owner-of-record.
   */
  private async personalDashboard(context: DashboardContextDescriptor) {
    const customerId = context.customerId;
    // `resolveContext` guarantees this for the personal branch; narrow for the type-checker.
    if (!customerId) throw new ForbiddenException('Authenticated customer required');
    const now = new Date();
    const [
      watching,
      offers,
      procurementRequests,
      supplyProgrammes,
      procurementResponses,
      caps,
      consignments,
      sellingSales,
      purchases,
      invoices,
    ] = await Promise.all([
      this.prisma.watch.count({ where: { customerId } }),
      this.prisma.offer.findMany({
        where: { customerId },
        select: { status: true, amountMinor: true, currency: true },
      }),
      // Personal book only — a request posted for an organization lives in that organization's
      // book, even though this customer is the row's `buyerCustomerId` (the poster of record).
      this.prisma.procurementRequest.findMany({
        where: { buyerCustomerId: customerId, buyerOrganizationId: null },
        select: { status: true },
      }),
      this.prisma.supplyProgramme.findMany({
        where: { supplierCustomerId: customerId },
        select: { status: true },
      }),
      this.prisma.procurementProposal.findMany({
        where: { supplierCustomerId: customerId },
        select: { status: true },
      }),
      this.prisma.customerCapability.findMany({
        where: { customerId },
        select: { capability: true, status: true, expiresAt: true },
      }),
      // Personal consignments only — organization-attributed assets are excluded by construction.
      this.prisma.asset.findMany({
        where: { ownerCustomerId: customerId, sellerOrganizationId: null },
        select: { lifecycle: true },
      }),
      // Personal sales: sold by this individual, with no selling-organization attribution.
      this.prisma.sale.findMany({
        where: {
          sellerOrganizationId: null,
          listing: { asset: { ownerCustomerId: customerId } },
        },
        select: { channel: true, amountMinor: true, currency: true },
      }),
      this.prisma.sale.findMany({
        where: { buyerCustomerId: customerId },
        select: { channel: true, amountMinor: true, currency: true },
      }),
      this.prisma.invoice.findMany({
        where: { buyerCustomerId: customerId },
        select: { status: true, amountDueMinor: true, currency: true },
      }),
    ]);

    const capabilities = caps.map((c) => ({
      status: effectiveCapabilityStatus(
        { capability: c.capability, status: c.status as CapabilityStatus, expiresAt: c.expiresAt },
        now,
      ),
    }));

    // Only offers still on the table are "committed" money; settled/withdrawn ones are history.
    const liveOffers = offers.filter((o) => o.status === 'open' || o.status === 'countered');
    const outstandingInvoices = invoices.filter((i) => i.status === 'issued');

    return buildDashboard({
      context,
      watching,
      offers: offers.map((o) => ({ status: String(o.status) })),
      procurementRequests: procurementRequests.map((r) => ({ status: String(r.status) })),
      supplyProgrammes: supplyProgrammes.map((s) => ({ status: String(s.status) })),
      procurementResponses: procurementResponses.map((p) => ({ status: String(p.status) })),
      capabilities,
      consignments: consignments.map((a) => ({ status: String(a.lifecycle) })),
      sellingSales: sellingSales.map((s) => ({ channel: String(s.channel) })),
      purchases: purchases.map((s) => ({ channel: String(s.channel) })),
      invoices: invoices.map((i) => ({ status: String(i.status) })),
      money: {
        buying: {
          openOffers: totalsByCurrency(liveOffers),
          purchases: totalsByCurrency(purchases),
          invoicesOutstanding: totalsByCurrency(
            outstandingInvoices.map((i) => ({
              currency: i.currency,
              amountMinor: i.amountDueMinor,
            })),
          ),
        },
        selling: { sales: totalsByCurrency(sellingSales) },
      },
    });
  }

  /**
   * The organization's cockpit. Reads ONLY rows carrying this organization's attribution; the
   * caller's own watchlist, offers, procurement activity and KYC capabilities are personal records
   * and are deliberately absent (reported empty, with a note) rather than folded in.
   */
  private async organizationDashboard(context: DashboardContextDescriptor) {
    const organizationId = context.organizationId;
    if (!organizationId) throw new BadRequestException('organizationId is required');
    const [consignments, sellingSales, procurementRequests] = await Promise.all([
      this.prisma.asset.findMany({
        where: { sellerOrganizationId: organizationId },
        select: { lifecycle: true },
      }),
      this.prisma.sale.findMany({
        where: { sellerOrganizationId: organizationId },
        select: { channel: true, amountMinor: true, currency: true },
      }),
      // Organization book only — keyed on the durable attribution, NOT on which member posted it,
      // so a colleague's request is included and no member's personal request ever is.
      this.prisma.procurementRequest.findMany({
        where: { buyerOrganizationId: organizationId },
        select: { status: true },
      }),
    ]);

    return buildDashboard({
      context,
      procurementRequests: procurementRequests.map((r) => ({ status: String(r.status) })),
      consignments: consignments.map((a) => ({ status: String(a.lifecycle) })),
      sellingSales: sellingSales.map((s) => ({ channel: String(s.channel) })),
      money: { selling: { sales: totalsByCurrency(sellingSales) } },
      notes: [
        'Watchlist, offers, invoices and purchases are attributed to the individual member, not ' +
          'to the organization, and are only shown in the personal context.',
        'Verification/KYC capabilities are held by the individual member and are only shown in ' +
          'the personal context.',
        'Supply programmes and procurement responses are attributed to the individual supplier ' +
          'and are only shown in the personal context.',
      ],
    });
  }

  /** Operator-scoped admin overview — config + record counts + attention alerts. Authorisation
   *  (`exchange:operate`) is enforced at the controller; the caller identity is not needed here. */
  async getControlCentreOverview(_principal: Principal, operatorCode?: string) {
    if (!this.config.get().features.controlCentre) {
      throw new NotFoundException('Control Centre is not enabled');
    }
    // Operator-scoped records filter by operatorCode when provided; global config is unscoped.
    const scoped = operatorCode ? { operatorCode } : {};
    const [
      operators,
      markets,
      routingRules,
      feeRules,
      paymentRoutes,
      supplyProgrammes,
      procurementRequests,
      pendingVerifications,
    ] = await Promise.all([
      this.prisma.operator.count(),
      this.prisma.market.count(),
      this.prisma.routingRule.count({ where: scoped }),
      this.prisma.feeRule.count({ where: scoped }),
      this.prisma.paymentRoute.count({ where: scoped }),
      this.prisma.supplyProgramme.count({ where: scoped }),
      this.prisma.procurementRequest.count({ where: scoped }),
      this.prisma.customerCapability.count({ where: { status: 'pending' } }),
    ]);
    const counts = {
      operators,
      markets,
      routingRules,
      feeRules,
      paymentRoutes,
      supplyProgrammes,
      procurementRequests,
      pendingVerifications,
    };
    return { operatorCode: operatorCode ?? null, counts, alerts: controlCentreAlerts(counts) };
  }
}
