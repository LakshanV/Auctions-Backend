import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  type CockpitAskInput,
  type CockpitQuery,
  type CockpitTimelineQuery,
} from '@singha/contracts';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditExposureService } from '../member/credit-exposure.service';
import { FxService } from '../fx/fx.service';
import { type Principal } from '../../shared/auth/principal';
import { classifyCockpitQuestion, type CockpitIntent } from './cockpit-intent';
import { CurrencyBuckets, minorExponent, moneyAmount } from './cockpit-money';

/**
 * Singha Cockpit — ONE unified, adaptive, authoritative read-model for the signed-in client.
 *
 * Identity is unified: a single Singha Client may buy, bid, sell, supply, post RFQs and act for one
 * or more ORGANISATIONS through authorised membership. This projection consolidates all of it, but
 * NEVER mixes personal and organisation state — the `context` selects one, and org context is only
 * granted to an authorised member. It is a rebuildable read model over the authoritative tables
 * (rule 2) — never a source of truth, never caching financial state.
 *
 * Money is CURRENCY-CORRECT and PRECISION-SAFE: minor units are never summed across currencies and
 * never pass through `Number(BigInt)` — see cockpit-money.ts.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const num = (v: bigint | null | undefined) => (v == null ? 0 : Number(v));
// A customer-id sentinel that matches no real row — used so personal-only reads run with stable
// Prisma include types and simply return [] in an organisation context (buying is never org-scoped).
const NO_MATCH = '__no_customer__';

interface LotLabel {
  listingId: string;
  reference: string;
  title: string;
  category: string;
}

type ListingLike = {
  id: string;
  publicRef: string;
  title: string | null;
  asset: { category: string };
};

type CockpitContext =
  | { kind: 'personal'; customerId: string }
  | { kind: 'organization'; customerId: string; organizationId: string; organizationName: string };

@Injectable()
export class CockpitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exposure: CreditExposureService,
    private readonly fx: FxService,
  ) {}

  private requireCustomer(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  /**
   * Resolve the cockpit context. `org` is an ORGANISATION the caller must be an AUTHORISED member of
   * (checked server-side); otherwise it is the caller's PERSONAL context. Personal and organisation
   * financial/activity state are scoped separately and never mixed.
   */
  private async resolveContext(principal: Principal, orgId?: string): Promise<CockpitContext> {
    const customerId = this.requireCustomer(principal);
    if (!orgId) return { kind: 'personal', customerId };
    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId: orgId, customerId },
      include: { organization: true },
    });
    if (!membership) {
      throw new ForbiddenException('You are not an authorized member of this organization');
    }
    return {
      kind: 'organization',
      customerId,
      organizationId: orgId,
      organizationName: membership.organization.legalName,
    };
  }

  // Seller-side scoping (assets/sales/settlements carry the org via `sellerOrganizationId`).
  private listingWhere(ctx: CockpitContext): Prisma.ListingWhereInput {
    return ctx.kind === 'organization'
      ? { asset: { sellerOrganizationId: ctx.organizationId } }
      : { asset: { ownerCustomerId: ctx.customerId, sellerOrganizationId: null } };
  }
  private sellerSaleWhere(ctx: CockpitContext): Prisma.SaleWhereInput {
    return ctx.kind === 'organization'
      ? { sellerOrganizationId: ctx.organizationId }
      : { sellerOrganizationId: null, listing: { asset: { ownerCustomerId: ctx.customerId } } };
  }
  private settlementWhere(ctx: CockpitContext): Prisma.SettlementWhereInput {
    return ctx.kind === 'organization'
      ? { listing: { asset: { sellerOrganizationId: ctx.organizationId } } }
      : { listing: { asset: { ownerCustomerId: ctx.customerId, sellerOrganizationId: null } } };
  }

  private lot(listing: ListingLike): LotLabel {
    return {
      listingId: listing.id,
      reference: listing.publicRef,
      title: listing.title ?? listing.asset.category,
      category: listing.asset.category,
    };
  }

  // ── Singha Account Health (deterministic, currency-correct, precision-safe) ───
  async accountHealth(principal: Principal, query: CockpitQuery = {}) {
    const ctx = await this.resolveContext(principal, query.org);
    const customer = await this.prisma.customer.findUnique({ where: { id: ctx.customerId } });
    const health = await this.buildAccountHealth(ctx);
    health.kyc = customer?.kycStatus;
    if (query.display) await this.attachDisplay(health, query.display);
    return health;
  }

  private async buildAccountHealth(ctx: CockpitContext) {
    const now = new Date();
    const personal = ctx.kind === 'personal';
    // Personal-only facts (credit facility, security, invoices, membership) run scoped by a sentinel
    // in org context, so they return nothing and never mix into organisation Account Health.
    const buyerId = personal ? ctx.customerId : NO_MATCH;

    const [capacity, security, membership, invoices, sellerSales, settlements] = await Promise.all([
      personal ? this.exposure.availability(ctx.customerId) : Promise.resolve(null),
      this.prisma.securityInstrument.findMany({
        where: {
          customerId: buyerId,
          status: { in: ['verified', 'active', 'release_pending', 'expired'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.membership.findFirst({
        where: { customerId: buyerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { buyerCustomerId: buyerId, status: 'issued' },
      }),
      this.prisma.sale.findMany({
        where: this.sellerSaleWhere(ctx),
        include: { listing: { include: { settlement: true } } },
      }),
      this.prisma.settlement.findMany({
        where: this.settlementWhere(ctx),
        include: { listing: true },
      }),
    ]);

    // Amounts to pay — grouped by the invoice's authoritative currency (NEVER summed across).
    const payBuckets = new CurrencyBuckets(['total', 'overdue'] as const);
    const overdueInvoices: typeof invoices = [];
    for (const inv of invoices) {
      const overdue = inv.dueAt < now;
      if (overdue) overdueInvoices.push(inv);
      payBuckets.add(
        inv.currency,
        { total: inv.amountDueMinor, overdue: overdue ? inv.amountDueMinor : 0n },
        { total: 1, overdue: overdue ? 1 : 0 },
      );
    }

    // Seller proceeds — pending (unsettled sales, by sale currency) + settled (by listing currency).
    const proceedsBuckets = new CurrencyBuckets(['pending', 'settled'] as const);
    let pendingCount = 0;
    for (const s of sellerSales) {
      if (!s.listing.settlement) {
        pendingCount += 1;
        proceedsBuckets.add(s.currency, { pending: s.amountMinor }, { pending: 1 });
      }
    }
    for (const st of settlements) {
      proceedsBuckets.add(st.listing.currency, { settled: st.netMinor }, { settled: 1 });
    }

    // Deposits / security — grouped by instrument currency.
    const secBuckets = new CurrencyBuckets(['verified', 'face'] as const);
    for (const sec of security) {
      const isVerified = sec.status === 'verified' || sec.status === 'active';
      secBuckets.add(
        sec.currency,
        {
          verified: isVerified ? (sec.eligibleAmountMinor ?? sec.faceAmountMinor) : 0n,
          face: sec.faceAmountMinor,
        },
        { verified: isVerified ? 1 : 0, face: 1 },
      );
    }
    const expiredSecurity = security.filter(
      (s) => s.status === 'expired' || (s.expiresAt && s.expiresAt < now),
    );

    // Concrete overdue actions (each carries its own currency + precision-safe minor string).
    const actions: Array<{
      kind: string;
      label: string;
      ref: string;
      amount?: ReturnType<typeof moneyAmount>;
    }> = [];
    for (const inv of overdueInvoices) {
      actions.push({
        kind: 'overdue_invoice',
        label: `Invoice ${inv.number} overdue`,
        ref: inv.id,
        amount: moneyAmount(inv.currency, inv.amountDueMinor),
      });
    }
    for (const sec of expiredSecurity) {
      actions.push({
        kind: 'expired_security',
        label: `${sec.type.replace(/_/g, ' ')} security lapsed`,
        ref: sec.id,
      });
    }
    if (membership && ['suspended', 'blocked', 'expired'].includes(membership.status)) {
      actions.push({
        kind: 'membership',
        label: `Membership ${membership.status}`,
        ref: membership.id,
      });
    }

    return {
      context: {
        kind: ctx.kind,
        organizationId: ctx.kind === 'organization' ? ctx.organizationId : null,
        organizationName: ctx.kind === 'organization' ? ctx.organizationName : null,
      },
      status: actions.length === 0 ? ('clear' as const) : ('attention' as const),
      membershipStatus: membership?.status ?? (personal ? 'pending' : 'n/a'),
      kyc: undefined as string | undefined,
      // Bid capacity is a PERSONAL, single-currency fact (credit facilities are per-customer).
      bidCapacity:
        capacity && capacity.hasFacility
          ? {
              currency: capacity.currency,
              exponent: minorExponent(capacity.currency),
              approvedMinor: String(capacity.approvedLimitMinor),
              committedMinor: String(capacity.committedMinor),
              availableMinor: String(capacity.availableMinor),
              hasFacility: true,
              expiresAt: iso((capacity as { expiresAt?: Date | null }).expiresAt),
            }
          : null,
      security: { count: security.length, byCurrency: secBuckets.toRows() },
      amountsToPay: {
        count: invoices.length,
        overdueCount: overdueInvoices.length,
        byCurrency: payBuckets.toRows(),
      },
      sellerProceeds: { pendingCount, byCurrency: proceedsBuckets.toRows() },
      overdueActions: actions,
      display: undefined as undefined | Record<string, unknown>,
    };
  }

  /**
   * OPTIONAL informational display equivalents (never binding, never replacing the authoritative
   * per-currency amounts). Sums each currency bucket converted into `displayCurrency` via a
   * timestamped FX snapshot. Best-effort — if FX display is unavailable the field is simply omitted.
   */
  private async attachDisplay(
    health: Awaited<ReturnType<CockpitService['buildAccountHealth']>>,
    displayCurrency: string,
  ): Promise<void> {
    try {
      let asOf: string | null = null;
      let stale = false;
      const rates: Array<{ from: string; rate: string }> = [];
      const convertSum = async (
        rows: Array<{ currency: string } & Record<string, unknown>>,
        key: string,
      ): Promise<string> => {
        let total = 0n;
        for (const row of rows) {
          const minor = BigInt(String(row[key] ?? '0'));
          if (row.currency === displayCurrency) {
            total += minor;
            continue;
          }
          if (minor === 0n) continue;
          const conv = await this.fx.convert(Number(minor), row.currency, displayCurrency);
          total += BigInt(Math.round(conv.convertedMinor));
          asOf = conv.rate?.quotedAt ?? asOf;
          stale = stale || Boolean(conv.stale);
          if (!rates.some((r) => r.from === row.currency)) {
            rates.push({ from: row.currency, rate: String(conv.rate?.rate ?? '') });
          }
        }
        return total.toString();
      };
      const pay = health.amountsToPay.byCurrency as Array<
        { currency: string } & Record<string, unknown>
      >;
      const proceeds = health.sellerProceeds.byCurrency as Array<
        { currency: string } & Record<string, unknown>
      >;
      health.display = {
        currency: displayCurrency,
        exponent: minorExponent(displayCurrency),
        binding: false,
        asOf,
        stale,
        note: 'Informational only — original transaction-currency amounts are authoritative.',
        amountsToPayMinor: await convertSum(pay, 'total'),
        overdueMinor: await convertSum(pay, 'overdue'),
        sellerProceedsPendingMinor: await convertSum(proceeds, 'pending'),
        sellerProceedsSettledMinor: await convertSum(proceeds, 'settled'),
        rates,
      };
    } catch {
      // FX display is optional; never fail Account Health because a rate is unavailable.
      health.display = undefined;
    }
  }

  // ── Full unified Cockpit ─────────────────────────────────────────────────────
  async cockpit(principal: Principal, query: CockpitQuery = {}) {
    const ctx = await this.resolveContext(principal, query.org);
    const customerId = ctx.customerId;
    const now = new Date();
    const personal = ctx.kind === 'personal';

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new ForbiddenException('Authenticated customer required');

    // The organizations this ONE human may act for (context selector on the FE).
    const memberships = await this.prisma.organizationMember.findMany({
      where: { customerId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });

    // Buying is PERSONAL (the platform models organisations as sellers, not buyers). These run
    // scoped by a sentinel in org context, so they return [] — personal purchases never leak into
    // org state — while keeping stable Prisma include types.
    const buyerId = personal ? customerId : NO_MATCH;
    const [
      maxes,
      watches,
      buyerOffers,
      eois,
      tenders,
      buyerInvoices,
      buyerSales,
      fulfilments,
      procurement,
      supply,
    ] = await this.prisma.$transaction([
      this.prisma.bidderMax.findMany({
        where: { bidderId: buyerId },
        include: { auction: { include: { listing: { include: { asset: true } } } } },
      }),
      this.prisma.watch.findMany({
        where: { customerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true, auction: true } } },
      }),
      this.prisma.offer.findMany({
        where: { customerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.eoi.findMany({
        where: { customerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.tenderBid.findMany({
        where: { customerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.invoice.findMany({
        where: { buyerCustomerId: buyerId },
        orderBy: { createdAt: 'desc' },
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.sale.findMany({
        where: { buyerCustomerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.fulfilment.findMany({
        where: { listing: { sale: { buyerCustomerId: buyerId } } },
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.procurementRequest.findMany({
        where: { buyerCustomerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.supplyProgramme.findMany({
        where: { supplierCustomerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    // Selling is scoped to the CONTEXT (personal non-org listings, or the org's listings).
    const [
      listings,
      drafts,
      offersReceived,
      sellerSales,
      settlements,
      conversations,
      notifications,
      capabilities,
    ] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where: this.listingWhere(ctx),
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: { asset: true, auction: true },
      }),
      personal
        ? this.prisma.sellerListingDraft.findMany({
            where: { ownerId: customerId, status: 'active' },
            orderBy: { updatedAt: 'desc' },
            take: 50,
          })
        : this.prisma.sellerListingDraft.findMany({ where: { id: '__none__' } }),
      this.prisma.offer.findMany({
        where: {
          listing: this.listingWhere(ctx),
          ...(personal ? { customerId: { not: customerId } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.sale.findMany({
        where: this.sellerSaleWhere(ctx),
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true, settlement: true } } },
      }),
      this.prisma.settlement.findMany({
        where: this.settlementWhere(ctx),
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      personal
        ? this.prisma.conversation.findMany({
            where: { customerId },
            orderBy: { updatedAt: 'desc' },
            take: 20,
          })
        : this.prisma.conversation.findMany({ where: { id: '__none__' } }),
      personal
        ? this.prisma.notificationDelivery.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : this.prisma.notificationDelivery.findMany({ where: { id: '__none__' } }),
      this.prisma.customerCapability.findMany({ where: { customerId } }),
    ]);

    const health = await this.buildAccountHealth(ctx);
    health.kyc = customer.kycStatus;
    if (query.display) await this.attachDisplay(health, query.display);

    const timeline = await this.timeline(principal, { org: query.org, limit: 25 }, ctx);

    // ── Identity + adaptive emphasis ──
    // A Singha identity is ONE person with capabilities, not a buyer OR seller account. 'buyer' is
    // always present; 'seller' is conferred by any real selling footprint in this context (owns
    // listings/drafts, has seller sales) OR membership of an organization one can sell for. Roles
    // and emphasis must agree — both are derived from the same authoritative activity.
    const sellingActivity = listings.length + drafts.length + sellerSales.length;
    const buyingActivity = maxes.length + watches.length + buyerSales.length + buyerOffers.length;
    const roles: Array<'buyer' | 'seller'> =
      sellingActivity > 0 || memberships.length > 0 ? ['buyer', 'seller'] : ['buyer'];
    const emphasis: 'buyer' | 'seller' | 'both' = !personal
      ? 'seller'
      : sellingActivity > 0 && buyingActivity > 0
        ? 'both'
        : sellingActivity > buyingActivity
          ? 'seller'
          : 'buyer';

    // ── Buying projections ──
    const openMaxes = maxes.filter((m) => m.auction.status === 'open');
    const winning = openMaxes.filter((m) => m.auction.highBidderId === customerId);
    const outbid = openMaxes.filter((m) => m.auction.highBidderId !== customerId);
    const closedMaxes = maxes.filter((m) => m.auction.status === 'closed');
    const won = closedMaxes.filter((m) => m.auction.winnerCustomerId === customerId);
    const auctionLot = (m: (typeof maxes)[number]) => ({
      ...this.lot(m.auction.listing),
      auctionId: m.auction.id,
      currentBidMinor: num(m.auction.currentBidMinor ?? m.auction.openingBidMinor),
      myMaxMinor: num(m.maxMinor),
      endsAt: iso(m.auction.endsAt),
      currency: m.auction.currency,
      exponent: minorExponent(m.auction.currency),
    });
    const readyPickup = fulfilments.filter((f) => f.state === 'ready_for_pickup');
    const paymentDue = buyerInvoices.filter((i) => i.status === 'issued');

    // ── Seller projections ──
    const activeListings = listings.filter((l) =>
      ['scheduled', 'live', 'published'].includes(l.status),
    );
    const openOffersReceived = offersReceived.filter((o) =>
      ['open', 'countered'].includes(o.status),
    );

    // ── Needs attention ──
    const attention: Array<{ kind: string; label: string; ref: string; at?: string | null }> = [];
    for (const m of outbid) {
      attention.push({
        kind: 'outbid',
        label: `Outbid on ${m.auction.listing.title ?? m.auction.listing.asset.category}`,
        ref: m.auction.id,
        at: iso(m.auction.endsAt),
      });
    }
    for (const inv of paymentDue) {
      attention.push({
        kind: inv.dueAt < now ? 'payment_overdue' : 'payment_due',
        label: `Pay invoice ${inv.number}`,
        ref: inv.id,
        at: iso(inv.dueAt),
      });
    }
    for (const f of readyPickup) {
      attention.push({
        kind: 'ready_for_pickup',
        label: `Ready for pickup: ${f.listing.title ?? f.listing.asset.category}`,
        ref: f.listing.id,
      });
    }
    for (const o of openOffersReceived) {
      attention.push({
        kind: 'offer_received',
        label: `Offer to review on ${o.listing.title ?? o.listing.asset.category}`,
        ref: o.id,
      });
    }
    for (const a of health.overdueActions) {
      if (a.kind !== 'overdue_invoice')
        attention.push({ kind: a.kind, label: a.label, ref: a.ref });
    }

    const moneyItem = (currency: string, minor: bigint) => ({
      currency,
      exponent: minorExponent(currency),
      minor: minor.toString(),
    });

    return {
      identity: {
        customerId: customer.id,
        clientReference: customer.clientReference,
        legalName: customer.legalName,
        kycStatus: customer.kycStatus,
        roles,
        emphasis,
        capabilities: capabilities.map((c) => ({ capability: c.capability, status: c.status })),
      },
      // The one human's context + the organizations they may act for (never a second identity).
      context: {
        kind: ctx.kind,
        organizationId: ctx.kind === 'organization' ? ctx.organizationId : null,
        organizationName: ctx.kind === 'organization' ? ctx.organizationName : null,
      },
      organizations: memberships.map((m) => ({
        organizationId: m.organizationId,
        reference: m.organization.organizationReference,
        legalName: m.organization.legalName,
        role: m.role,
      })),
      accountHealth: health,
      needsAttention: attention,
      timeline,
      buying: {
        summary: {
          activeBids: openMaxes.length,
          winning: winning.length,
          outbid: outbid.length,
          watched: watches.length,
          purchases: buyerSales.length,
        },
        activeBids: openMaxes.map(auctionLot),
        winning: winning.map(auctionLot),
        outbid: outbid.map(auctionLot),
        won: won.map(auctionLot),
        watched: watches.map((w) => ({
          ...this.lot(w.listing),
          currency: w.listing.currency,
          currentBidMinor: w.listing.auction
            ? num(w.listing.auction.currentBidMinor ?? w.listing.auction.openingBidMinor)
            : null,
          endsAt: iso(w.listing.auction?.endsAt ?? w.listing.closesAt),
        })),
        offers: buyerOffers.map((o) => ({
          ...this.lot(o.listing),
          offerId: o.id,
          status: o.status,
          amount: moneyItem(o.currency, o.amountMinor),
        })),
        eois: eois.map((e) => ({
          ...this.lot(e.listing),
          eoiId: e.id,
          status: e.status,
          amount: e.amountMinor == null ? null : moneyItem(e.currency, e.amountMinor),
        })),
        tenders: tenders.map((t) => ({
          ...this.lot(t.listing),
          tenderId: t.id,
          amount: moneyItem(t.currency, t.amountMinor),
        })),
        purchases: buyerSales.map((s) => ({
          ...this.lot(s.listing),
          saleId: s.id,
          amount: moneyItem(s.currency, s.amountMinor),
          at: iso(s.createdAt),
        })),
        invoices: buyerInvoices.map((i) => ({
          ...this.lot(i.listing),
          invoiceId: i.id,
          number: i.number,
          status: i.status,
          amountDue: moneyItem(i.currency, i.amountDueMinor),
          dueAt: iso(i.dueAt),
        })),
      },
      selling: {
        summary: {
          activeListings: activeListings.length,
          drafts: drafts.length,
          offersReceived: openOffersReceived.length,
          sales: sellerSales.length,
          // Per-currency pending proceeds (never a single cross-currency sum).
          pendingProceeds: health.sellerProceeds.byCurrency,
        },
        activeListings: activeListings.map((l) => ({
          ...this.lot(l),
          status: l.status,
          saleMethod: l.saleMethod,
          currency: l.currency,
          currentBidMinor: l.auction
            ? num(l.auction.currentBidMinor ?? l.auction.openingBidMinor)
            : null,
          endsAt: iso(l.auction?.endsAt ?? l.closesAt),
        })),
        drafts: drafts.map((d) => ({
          draftId: d.id,
          title: d.title,
          status: d.status,
          updatedAt: iso(d.updatedAt),
        })),
        offersReceived: openOffersReceived.map((o) => ({
          ...this.lot(o.listing),
          offerId: o.id,
          status: o.status,
          amount: moneyItem(o.currency, o.amountMinor),
        })),
        sales: sellerSales.map((s) => ({
          ...this.lot(s.listing),
          saleId: s.id,
          amount: moneyItem(s.currency, s.amountMinor),
          settled: Boolean(s.listing.settlement),
          at: iso(s.createdAt),
        })),
        settlements: settlements.map((s) => ({
          ...this.lot(s.listing),
          settlementId: s.id,
          net: moneyItem(s.listing.currency, s.netMinor),
          saleProceeds: moneyItem(s.listing.currency, s.saleProceedsMinor),
          commission: moneyItem(s.listing.currency, s.commissionMinor),
          at: iso(s.createdAt),
        })),
      },
      procurement: {
        requests: procurement.map((p) => ({
          requestId: p.id,
          title: p.title,
          type: p.type,
          status: p.status,
          category: p.category,
          createdAt: iso(p.createdAt),
        })),
      },
      supply: {
        programmes: supply.map((s) => ({
          programmeId: s.id,
          product: s.product,
          status: s.status,
          category: s.category,
          createdAt: iso(s.createdAt),
        })),
      },
      conversations: {
        count: conversations.length,
        recent: conversations.map((c) => ({
          id: c.id,
          channel: c.channel,
          status: c.status,
          updatedAt: iso(c.updatedAt),
        })),
      },
      notifications: {
        recent: notifications.map((d) => ({
          id: d.id,
          title: d.title,
          body: d.body,
          channel: d.channel,
          status: d.status,
          at: iso(d.createdAt),
        })),
      },
    };
  }

  // ── Unified chronological Activity Timeline (projection, never a 2nd ledger) ──
  async timeline(principal: Principal, query: CockpitTimelineQuery, preresolved?: CockpitContext) {
    const ctx = preresolved ?? (await this.resolveContext(principal, query.org));
    const take = query.limit ?? 100;
    const personal = ctx.kind === 'personal';
    // Personal-only event streams run scoped by a sentinel in org context (→ empty), so an org
    // timeline never shows a member's personal buying/conversations while keeping stable types.
    const buyerId = personal ? ctx.customerId : NO_MATCH;

    const [
      bids,
      buyerOffers,
      tenders,
      eois,
      invoices,
      payments,
      buyerSales,
      sellerSales,
      settlements,
      fulfilments,
      logistics,
      procurement,
      supply,
      inspections,
      conversations,
      security,
    ] = await Promise.all([
      this.prisma.bid.findMany({
        where: { bidderId: buyerId },
        orderBy: { placedAt: 'desc' },
        take,
        include: { auction: { include: { listing: { include: { asset: true } } } } },
      }),
      this.prisma.offer.findMany({
        where: { customerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.tenderBid.findMany({
        where: { customerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.eoi.findMany({
        where: { customerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.invoice.findMany({
        where: { buyerCustomerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.payment.findMany({
        where: { invoice: { buyerCustomerId: buyerId } },
        orderBy: { createdAt: 'desc' },
        take,
        include: { invoice: true },
      }),
      this.prisma.sale.findMany({
        where: { buyerCustomerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.sale.findMany({
        where: this.sellerSaleWhere(ctx),
        orderBy: { createdAt: 'desc' },
        take,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.settlement.findMany({
        where: this.settlementWhere(ctx),
        orderBy: { createdAt: 'desc' },
        take,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.fulfilment.findMany({
        where: { listing: { sale: { buyerCustomerId: buyerId } } },
        orderBy: { updatedAt: 'desc' },
        take,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.logisticsBooking.findMany({
        where: { bookedByCustomerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.procurementRequest.findMany({
        where: { buyerCustomerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.supplyProgramme.findMany({
        where: { supplierCustomerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.assetInspectionEvidence.findMany({
        where: {
          asset:
            ctx.kind === 'organization'
              ? { sellerOrganizationId: ctx.organizationId }
              : { ownerCustomerId: buyerId },
        },
        orderBy: { createdAt: 'desc' },
        take,
        include: { asset: true },
      }),
      this.prisma.conversation.findMany({
        where: { customerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.securityInstrument.findMany({
        where: { customerId: buyerId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);

    const entries: Array<{
      at: string;
      kind: string;
      group: string;
      title: string;
      refType: string;
      refId: string;
      listing?: LotLabel | null;
      amount?: ReturnType<typeof moneyAmount> | null;
      status?: string | null;
    }> = [];
    const push = (e: (typeof entries)[number]) => entries.push(e);

    for (const b of bids)
      push({
        at: b.placedAt.toISOString(),
        kind: 'bid',
        group: 'bidding',
        title: 'Bid placed',
        refType: 'Auction',
        refId: b.auctionId,
        listing: this.lot(b.auction.listing),
        amount: moneyAmount(b.auction.currency, b.amountMinor),
        status: b.status,
      });
    for (const o of buyerOffers)
      push({
        at: o.createdAt.toISOString(),
        kind: 'offer',
        group: 'buying',
        title: o.sealed ? 'Sealed offer submitted' : 'Offer made',
        refType: 'Offer',
        refId: o.id,
        listing: this.lot(o.listing),
        amount: moneyAmount(o.currency, o.amountMinor),
        status: o.status,
      });
    for (const t of tenders)
      push({
        at: t.createdAt.toISOString(),
        kind: 'tender',
        group: 'buying',
        title: 'Sealed tender bid',
        refType: 'TenderBid',
        refId: t.id,
        listing: this.lot(t.listing),
        amount: moneyAmount(t.currency, t.amountMinor),
      });
    for (const e of eois)
      push({
        at: e.createdAt.toISOString(),
        kind: 'eoi',
        group: 'buying',
        title: 'Expression of interest',
        refType: 'Eoi',
        refId: e.id,
        listing: this.lot(e.listing),
        amount: e.amountMinor == null ? null : moneyAmount(e.currency, e.amountMinor),
        status: e.status,
      });
    for (const i of invoices)
      push({
        at: i.createdAt.toISOString(),
        kind: 'invoice',
        group: 'payment',
        title: `Invoice ${i.number} ${i.status}`,
        refType: 'Invoice',
        refId: i.id,
        listing: this.lot(i.listing),
        amount: moneyAmount(i.currency, i.amountDueMinor),
        status: i.status,
      });
    for (const p of payments)
      push({
        at: p.createdAt.toISOString(),
        kind: 'payment',
        group: 'payment',
        title: `Payment ${p.status.replace(/_/g, ' ')}`,
        refType: 'Payment',
        refId: p.id,
        amount: moneyAmount(p.invoice.currency, p.amountMinor),
        status: p.status,
      });
    for (const s of buyerSales)
      push({
        at: s.createdAt.toISOString(),
        kind: 'purchase',
        group: 'buying',
        title: 'Purchase completed',
        refType: 'Sale',
        refId: s.id,
        listing: this.lot(s.listing),
        amount: moneyAmount(s.currency, s.amountMinor),
      });
    for (const s of sellerSales)
      push({
        at: s.createdAt.toISOString(),
        kind: 'sale',
        group: 'selling',
        title: 'Sale completed',
        refType: 'Sale',
        refId: s.id,
        listing: this.lot(s.listing),
        amount: moneyAmount(s.currency, s.amountMinor),
      });
    for (const st of settlements)
      push({
        at: st.createdAt.toISOString(),
        kind: 'settlement',
        group: 'selling',
        title: 'Seller settlement',
        refType: 'Settlement',
        refId: st.id,
        listing: this.lot(st.listing),
        amount: moneyAmount(st.listing.currency, st.netMinor),
      });
    for (const f of fulfilments)
      push({
        at: f.updatedAt.toISOString(),
        kind: 'fulfilment',
        group: 'logistics',
        title: `Fulfilment: ${f.state.replace(/_/g, ' ')}`,
        refType: 'Fulfilment',
        refId: f.id,
        listing: this.lot(f.listing),
        status: f.state,
      });
    for (const l of logistics)
      push({
        at: l.createdAt.toISOString(),
        kind: 'logistics',
        group: 'logistics',
        title: 'Logistics booked',
        refType: 'LogisticsBooking',
        refId: l.id,
      });
    for (const p of procurement)
      push({
        at: p.createdAt.toISOString(),
        kind: 'rfq',
        group: 'procurement',
        title: `RFQ: ${p.title}`,
        refType: 'ProcurementRequest',
        refId: p.id,
        status: p.status,
      });
    for (const s of supply)
      push({
        at: s.createdAt.toISOString(),
        kind: 'supply',
        group: 'supply',
        title: `Supply programme: ${s.product}`,
        refType: 'SupplyProgramme',
        refId: s.id,
        status: s.status,
      });
    for (const ie of inspections)
      push({
        at: ie.createdAt.toISOString(),
        kind: 'inspection',
        group: 'inspection',
        title: `Inspection ${ie.kind.replace(/_/g, ' ')} ${ie.status}`,
        refType: 'AssetInspectionEvidence',
        refId: ie.id,
        status: ie.status,
      });
    for (const c of conversations)
      push({
        at: c.createdAt.toISOString(),
        kind: 'conversation',
        group: 'conversation',
        title: `Conversation on ${c.channel}`,
        refType: 'Conversation',
        refId: c.id,
        status: c.status,
      });
    for (const sec of security)
      push({
        at: sec.createdAt.toISOString(),
        kind: 'security',
        group: 'account',
        title: `${sec.type.replace(/_/g, ' ')} ${sec.status.replace(/_/g, ' ')}`,
        refType: 'SecurityInstrument',
        refId: sec.id,
        amount: moneyAmount(sec.currency, sec.faceAmountMinor),
        status: sec.status,
      });

    entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return {
      context: ctx.kind,
      count: Math.min(entries.length, take),
      entries: entries.slice(0, take),
    };
  }

  // ── Contextual Singha AI (interprets intent → authoritative facts) ────────────
  async ask(principal: Principal, input: CockpitAskInput, query: CockpitQuery = {}) {
    const intent: CockpitIntent = classifyCockpitQuestion(input.question);
    const cockpit = await this.cockpit(principal, query);

    // Format a per-currency figure list from grouped buckets — never a cross-currency sum.
    const fmtBuckets = (rows: Array<Record<string, unknown>>, key: string): string => {
      const parts = rows
        .filter((r) => BigInt(String(r[key] ?? '0')) > 0n)
        .map((r) => this.fmtMoney(String(r.currency), Number(r.exponent), String(r[key])));
      return parts.length ? parts.join(' + ') : 'nothing';
    };

    switch (intent) {
      case 'bid_capacity': {
        const c = cockpit.accountHealth.bidCapacity;
        return this.answer(
          intent,
          c
            ? `You can bid up to ${this.fmtMoney(c.currency, c.exponent, c.availableMinor)} right now (approved ${this.fmtMoney(c.currency, c.exponent, c.approvedMinor)}, ${this.fmtMoney(c.currency, c.exponent, c.committedMinor)} committed).`
            : 'You have no active bid facility yet. Add a deposit or security to unlock bid capacity.',
          { bidCapacity: c },
        );
      }
      case 'amounts_owed': {
        const p = cockpit.accountHealth.amountsToPay;
        return this.answer(
          intent,
          p.count === 0
            ? 'You have nothing to pay right now.'
            : `You owe ${fmtBuckets(p.byCurrency, 'total')} across ${p.count} invoice(s)` +
                (p.overdueCount
                  ? `, of which ${fmtBuckets(p.byCurrency, 'overdue')} is overdue.`
                  : '.'),
          { amountsToPay: p },
        );
      }
      case 'seller_proceeds': {
        const s = cockpit.accountHealth.sellerProceeds;
        return this.answer(
          intent,
          s.pendingCount === 0
            ? `No seller proceeds are pending. Settled to date: ${fmtBuckets(s.byCurrency, 'settled')}.`
            : `${fmtBuckets(s.byCurrency, 'pending')} in seller proceeds is pending across ${s.pendingCount} sold lot(s); ${fmtBuckets(s.byCurrency, 'settled')} settled to date.`,
          { sellerProceeds: s },
        );
      }
      case 'winning': {
        const w = cockpit.buying.winning;
        return this.answer(
          intent,
          w.length === 0
            ? 'You are not the top bidder on any live lot right now.'
            : `You are winning ${w.length} live lot(s).`,
          { winning: w, outbid: cockpit.buying.outbid },
        );
      }
      case 'purchases': {
        const p = cockpit.buying.purchases;
        return this.answer(
          intent,
          p.length === 0 ? 'You have no purchases yet.' : `You have ${p.length} purchase(s).`,
          { purchases: p },
        );
      }
      case 'attention':
      default: {
        const a = cockpit.needsAttention;
        return this.answer(
          'attention',
          a.length === 0
            ? 'Nothing needs your attention right now.'
            : `${a.length} thing(s) need your attention: ${a
                .slice(0, 5)
                .map((x) => x.label)
                .join('; ')}.`,
          { needsAttention: a, accountHealthStatus: cockpit.accountHealth.status },
        );
      }
    }
  }

  /** Human display of a precision-safe minor amount using the canonical exponent (no /100). */
  private fmtMoney(currency: string, exponent: number, minor: string): string {
    const negative = minor.startsWith('-');
    const digits = (negative ? minor.slice(1) : minor).padStart(exponent + 1, '0');
    const whole = exponent === 0 ? digits : digits.slice(0, -exponent) || '0';
    const frac = exponent === 0 ? '' : `.${digits.slice(-exponent)}`;
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${negative ? '-' : ''}${currency} ${grouped}${frac}`;
  }

  private answer(intent: string, reply: string, facts: Record<string, unknown>) {
    return {
      intent,
      reply,
      facts,
      disclaimer: 'Answered from your authoritative Singha account facts.',
    };
  }
}
