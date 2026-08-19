import { ForbiddenException, Injectable } from '@nestjs/common';
import { PLATFORM_CURRENCY } from '@singha/config';
import { type CockpitAskInput } from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditExposureService } from '../member/credit-exposure.service';
import { type Principal } from '../../shared/auth/principal';
import { classifyCockpitQuestion, type CockpitIntent } from './cockpit-intent';

/**
 * Singha Cockpit — ONE unified, adaptive, authoritative read-model for the signed-in client
 * (unified-identity pass). A single Singha Client may simultaneously buy, bid, sell, supply, post
 * RFQs and use services; this projection consolidates every one of those activity-contexts for the
 * SAME customerId. It is a rebuildable read model over the authoritative tables (CLAUDE.md rule 2)
 * — it never becomes a source of truth and never caches financial state. Buyer/seller/supplier are
 * capabilities, not accounts: the cockpit derives emphasis from what the one customer actually does.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const n = (v: bigint | null | undefined) => (v == null ? 0 : Number(v));

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

@Injectable()
export class CockpitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exposure: CreditExposureService,
  ) {}

  private customerId(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  private lot(listing: ListingLike): LotLabel {
    return {
      listingId: listing.id,
      reference: listing.publicRef,
      title: listing.title ?? listing.asset.category,
      category: listing.asset.category,
    };
  }

  // ── Singha Account Health (deterministic facts — never an opaque score) ──────
  /**
   * Account Health is built ONLY from deterministic Singha account facts: available bid capacity,
   * utilised exposure, deposits/security, overdue invoices, amounts to pay and pending seller
   * settlements. There is NO invented consumer credit score — `status` is a plain traffic light
   * derived from whether any concrete overdue action exists.
   */
  async accountHealth(principal: Principal) {
    return this.buildAccountHealth(this.customerId(principal));
  }

  private async buildAccountHealth(customerId: string) {
    const now = new Date();
    const [capacity, security, membership, invoices, sellerSales, settlements] = await Promise.all([
      this.exposure.availability(customerId),
      this.prisma.securityInstrument.findMany({
        where: { customerId, status: { in: ['verified', 'active', 'release_pending', 'expired'] } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.membership.findFirst({ where: { customerId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.invoice.findMany({
        where: { buyerCustomerId: customerId, status: 'issued' },
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.sale.findMany({
        where: { listing: { asset: { ownerCustomerId: customerId } } },
        include: { listing: { include: { asset: true, settlement: true } } },
      }),
      this.prisma.settlement.findMany({
        where: { listing: { asset: { ownerCustomerId: customerId } } },
      }),
    ]);

    const overdueInvoices = invoices.filter((i) => i.dueAt < now);
    const amountsToPayMinor = invoices.reduce((s, i) => s + n(i.amountDueMinor), 0);
    const overdueMinor = overdueInvoices.reduce((s, i) => s + n(i.amountDueMinor), 0);

    // Pending seller proceeds: sold lots the seller owns that are not settled yet.
    const pendingSettlementSales = sellerSales.filter((s) => !s.listing.settlement);
    const pendingProceedsMinor = pendingSettlementSales.reduce((s, x) => s + n(x.amountMinor), 0);
    const settledProceedsMinor = settlements.reduce((s, x) => s + n(x.netMinor), 0);

    const verifiedSecurityMinor = security
      .filter((s) => s.status === 'verified' || s.status === 'active')
      .reduce((s, x) => s + n(x.eligibleAmountMinor ?? x.faceAmountMinor), 0);
    const expiredSecurity = security.filter(
      (s) => s.status === 'expired' || (s.expiresAt && s.expiresAt < now),
    );

    // Concrete overdue actions (each is a real, addressable fact — not a score input).
    const actions: Array<{ kind: string; label: string; ref: string; amountMinor?: number }> = [];
    for (const inv of overdueInvoices) {
      actions.push({
        kind: 'overdue_invoice',
        label: `Invoice ${inv.number} overdue`,
        ref: inv.id,
        amountMinor: n(inv.amountDueMinor),
      });
    }
    for (const sec of expiredSecurity) {
      actions.push({
        kind: 'expired_security',
        label: `${sec.type.replace(/_/g, ' ')} security lapsed`,
        ref: sec.id,
      });
    }
    const membershipBlocked =
      membership && ['suspended', 'blocked', 'expired'].includes(membership.status);
    if (membershipBlocked) {
      actions.push({
        kind: 'membership',
        label: `Membership ${membership!.status}`,
        ref: membership!.id,
      });
    }

    return {
      status: actions.length === 0 ? ('clear' as const) : ('attention' as const),
      currency: capacity.currency ?? PLATFORM_CURRENCY,
      membershipStatus: membership?.status ?? 'pending',
      kyc: undefined as string | undefined, // filled by caller who has the customer row
      bidCapacity: {
        approvedMinor: capacity.approvedLimitMinor,
        committedMinor: capacity.committedMinor,
        availableMinor: capacity.availableMinor,
        hasFacility: capacity.hasFacility,
        expiresAt: iso((capacity as { expiresAt?: Date | null }).expiresAt),
      },
      security: {
        verifiedMinor: verifiedSecurityMinor,
        count: security.length,
        instruments: security.map((s) => ({
          type: s.type,
          status: s.status,
          faceAmountMinor: n(s.faceAmountMinor),
          eligibleMinor: n(s.eligibleAmountMinor),
          currency: s.currency,
          expiresAt: iso(s.expiresAt),
        })),
      },
      amountsToPay: {
        count: invoices.length,
        totalMinor: amountsToPayMinor,
        overdueCount: overdueInvoices.length,
        overdueMinor,
      },
      sellerProceeds: {
        pendingCount: pendingSettlementSales.length,
        pendingMinor: pendingProceedsMinor,
        settledMinor: settledProceedsMinor,
      },
      overdueActions: actions,
    };
  }

  // ── Full unified Cockpit ─────────────────────────────────────────────────────
  async cockpit(principal: Principal) {
    const customerId = this.customerId(principal);
    const now = new Date();

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new ForbiddenException('Authenticated customer required');

    // Batch the reads by activity-context. Everything is keyed to the SAME customerId.
    const [
      // buyer
      maxes,
      watches,
      buyerOffers,
      eois,
      tenders,
      buyerInvoices,
      buyerSales,
      fulfilments,
      // seller
      listings,
      drafts,
      offersReceived,
      sellerSales,
      settlements,
      // other
      procurement,
      supply,
      conversations,
      notifications,
      capabilities,
      assetCount,
      orgCount,
    ] = await Promise.all([
      this.prisma.bidderMax.findMany({
        where: { bidderId: customerId },
        include: { auction: { include: { listing: { include: { asset: true } } } } },
      }),
      this.prisma.watch.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true, auction: true } } },
      }),
      this.prisma.offer.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.eoi.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.tenderBid.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.invoice.findMany({
        where: { buyerCustomerId: customerId },
        orderBy: { createdAt: 'desc' },
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.sale.findMany({
        where: { buyerCustomerId: customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.fulfilment.findMany({
        where: { listing: { sale: { buyerCustomerId: customerId } } },
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.listing.findMany({
        where: { asset: { ownerCustomerId: customerId } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: { asset: true, auction: true },
      }),
      this.prisma.sellerListingDraft.findMany({
        where: { ownerId: customerId, status: 'active' },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.offer.findMany({
        where: {
          listing: { asset: { ownerCustomerId: customerId } },
          customerId: { not: customerId },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.sale.findMany({
        where: { listing: { asset: { ownerCustomerId: customerId } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true, settlement: true } } },
      }),
      this.prisma.settlement.findMany({
        where: { listing: { asset: { ownerCustomerId: customerId } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { listing: { include: { asset: true } } },
      }),
      this.prisma.procurementRequest.findMany({
        where: { buyerCustomerId: customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.supplyProgramme.findMany({
        where: { supplierCustomerId: customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.conversation.findMany({
        where: { customerId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.notificationDelivery.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.customerCapability.findMany({ where: { customerId } }),
      this.prisma.asset.count({ where: { ownerCustomerId: customerId } }),
      this.prisma.organizationMember.count({ where: { customerId } }),
    ]);

    const health = await this.buildAccountHealth(customerId);
    health.kyc = customer.kycStatus;

    // ── Identity + adaptive emphasis (deriveRoles §1: seller = owns assets OR in an org) ──
    const isSeller = assetCount > 0 || orgCount > 0;
    const roles: Array<'buyer' | 'seller'> = isSeller ? ['buyer', 'seller'] : ['buyer'];
    const sellingActivity = listings.length + drafts.length + sellerSales.length;
    const buyingActivity = maxes.length + watches.length + buyerSales.length + buyerOffers.length;
    const emphasis: 'buyer' | 'seller' | 'both' =
      isSeller && sellingActivity > 0 && buyingActivity > 0
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
      currentBidMinor: n(m.auction.currentBidMinor ?? m.auction.openingBidMinor),
      myMaxMinor: n(m.maxMinor),
      endsAt: iso(m.auction.endsAt),
      currency: m.auction.currency,
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

    // ── Needs attention (adaptive across buyer + seller) ──
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
      accountHealth: health,
      needsAttention: attention,
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
          currentBidMinor: w.listing.auction
            ? n(w.listing.auction.currentBidMinor ?? w.listing.auction.openingBidMinor)
            : null,
          endsAt: iso(w.listing.auction?.endsAt ?? w.listing.closesAt),
        })),
        offers: buyerOffers.map((o) => ({
          ...this.lot(o.listing),
          offerId: o.id,
          status: o.status,
          amountMinor: n(o.amountMinor),
          currency: o.currency,
        })),
        eois: eois.map((e) => ({
          ...this.lot(e.listing),
          eoiId: e.id,
          status: e.status,
          amountMinor: n(e.amountMinor),
        })),
        tenders: tenders.map((t) => ({
          ...this.lot(t.listing),
          tenderId: t.id,
          amountMinor: n(t.amountMinor),
        })),
        purchases: buyerSales.map((s) => ({
          ...this.lot(s.listing),
          saleId: s.id,
          amountMinor: n(s.amountMinor),
          currency: s.currency,
          at: iso(s.createdAt),
        })),
        invoices: buyerInvoices.map((i) => ({
          ...this.lot(i.listing),
          invoiceId: i.id,
          number: i.number,
          status: i.status,
          amountDueMinor: n(i.amountDueMinor),
          dueAt: iso(i.dueAt),
        })),
      },
      selling: {
        summary: {
          activeListings: activeListings.length,
          drafts: drafts.length,
          offersReceived: openOffersReceived.length,
          sales: sellerSales.length,
          pendingProceedsMinor: health.sellerProceeds.pendingMinor,
        },
        activeListings: activeListings.map((l) => ({
          ...this.lot(l),
          status: l.status,
          saleMethod: l.saleMethod,
          currentBidMinor: l.auction
            ? n(l.auction.currentBidMinor ?? l.auction.openingBidMinor)
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
          amountMinor: n(o.amountMinor),
          currency: o.currency,
        })),
        sales: sellerSales.map((s) => ({
          ...this.lot(s.listing),
          saleId: s.id,
          amountMinor: n(s.amountMinor),
          currency: s.currency,
          settled: Boolean(s.listing.settlement),
          at: iso(s.createdAt),
        })),
        settlements: settlements.map((s) => ({
          ...this.lot(s.listing),
          settlementId: s.id,
          netMinor: n(s.netMinor),
          saleProceedsMinor: n(s.saleProceedsMinor),
          commissionMinor: n(s.commissionMinor),
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

  // ── Contextual Singha AI (interprets intent → authoritative facts) ────────────
  /**
   * The client asks a plain-language question; a DETERMINISTIC classifier maps it to one authoritative
   * fact-slice of the cockpit (never a model that could invent numbers — rule 3/11). The reply carries
   * both a human sentence and the underlying facts so the UI can render them verbatim.
   */
  async ask(principal: Principal, input: CockpitAskInput) {
    this.customerId(principal); // assert an authenticated client (throws otherwise)
    const intent: CockpitIntent = classifyCockpitQuestion(input.question);
    const cockpit = await this.cockpit(principal);
    const cur = cockpit.accountHealth.currency;
    const money = (minor: number) => `${cur} ${(minor / 100).toLocaleString()}`;

    switch (intent) {
      case 'bid_capacity': {
        const c = cockpit.accountHealth.bidCapacity;
        return this.answer(
          intent,
          c.hasFacility
            ? `You can bid up to ${money(c.availableMinor)} right now (approved ${money(c.approvedMinor)}, ${money(c.committedMinor)} committed).`
            : `You have no active bid facility yet, so available bid capacity is ${money(0)}. Add a deposit or security to unlock capacity.`,
          { bidCapacity: c },
        );
      }
      case 'amounts_owed': {
        const p = cockpit.accountHealth.amountsToPay;
        return this.answer(
          intent,
          p.count === 0
            ? 'You have nothing to pay right now.'
            : `You owe ${money(p.totalMinor)} across ${p.count} invoice(s)` +
                (p.overdueCount ? `, of which ${money(p.overdueMinor)} is overdue.` : '.'),
          {
            amountsToPay: p,
            invoices: cockpit.buying.invoices.filter((i) => i.status === 'issued'),
          },
        );
      }
      case 'seller_proceeds': {
        const s = cockpit.accountHealth.sellerProceeds;
        return this.answer(
          intent,
          s.pendingCount === 0
            ? `No seller proceeds are pending. Settled to date: ${money(s.settledMinor)}.`
            : `${money(s.pendingMinor)} in seller proceeds is pending across ${s.pendingCount} sold lot(s); ${money(s.settledMinor)} settled to date.`,
          { sellerProceeds: s, settlements: cockpit.selling.settlements },
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

  private answer(intent: string, reply: string, facts: Record<string, unknown>) {
    return {
      intent,
      reply,
      facts,
      disclaimer: 'Answered from your authoritative Singha account facts.',
    };
  }
}
