import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CapabilityStatus,
  buildDashboard,
  controlCentreAlerts,
  effectiveCapabilityStatus,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { type Principal } from '../../shared/auth/principal';

/**
 * Dashboard + Control Centre service (Evolution E11b, pack doc 11). Two read-only projections: a
 * member's cross-domain command centre and an operator-scoped admin overview. No authoritative data
 * is owned here — every count is derived from the domain that owns the record. Flag-gated by
 * `dashboard` / `controlCentre`.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private customer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  /** The caller's unified dashboard (Buying / Selling / Verification). */
  async getDashboard(principal: Principal) {
    if (!this.config.get().features.dashboard) {
      throw new NotFoundException('Dashboard is not enabled');
    }
    const customerId = this.customer(principal);
    const now = new Date();
    const [watching, offers, procurementRequests, supplyProgrammes, procurementResponses, caps] =
      await Promise.all([
        this.prisma.watch.count({ where: { customerId } }),
        this.prisma.offer.findMany({ where: { customerId }, select: { status: true } }),
        this.prisma.procurementRequest.findMany({
          where: { buyerCustomerId: customerId },
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
      ]);
    const capabilities = caps.map((c) => ({
      status: effectiveCapabilityStatus(
        { capability: c.capability, status: c.status as CapabilityStatus, expiresAt: c.expiresAt },
        now,
      ),
    }));
    return buildDashboard({
      watching,
      offers: offers.map((o) => ({ status: String(o.status) })),
      procurementRequests,
      supplyProgrammes,
      procurementResponses,
      capabilities,
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
