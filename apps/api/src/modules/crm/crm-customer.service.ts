import { Injectable, NotFoundException } from '@nestjs/common';
import { PLATFORM_CURRENCY } from '@singha/config';
import { type CrmTimelineQuery } from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { CrmService } from './crm.service';

/**
 * Staff CRM view of ONE customer (completion pass §3/§18). Two read projections over the
 * authoritative tables — a transactional history summary and a unified chronological timeline.
 *
 * Both are REBUILDABLE read models, never a source of truth and never a second ledger: every
 * field is derived from the owning domain's own records (bids, offers, tenders, EOIs, invoices,
 * sales, fulfilments, conversations) plus the Singha-native CRM notes/tasks. Nothing here is
 * customer-facing — access is gated to `crm:read` at the controller.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const num = (v: bigint | null | undefined) => (v == null ? null : Number(v));

interface ListingLabel {
  listingId: string;
  reference: string;
  title: string;
  category: string;
}

interface TimelineEntry {
  at: string;
  kind:
    | 'bid'
    | 'offer'
    | 'tender'
    | 'eoi'
    | 'invoice'
    | 'sale'
    | 'fulfilment'
    | 'conversation'
    | 'note'
    | 'task';
  title: string;
  refType: string;
  refId: string;
  listing?: ListingLabel | null;
  amountMinor?: number | null;
  currency?: string | null;
  status?: string | null;
}

type ListingWithAsset = {
  id: string;
  publicRef: string;
  title: string | null;
  asset: { category: string };
};

@Injectable()
export class CrmCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
  ) {}

  private label(listing: ListingWithAsset): ListingLabel {
    return {
      listingId: listing.id,
      reference: listing.publicRef,
      title: listing.title ?? listing.asset.category,
      category: listing.asset.category,
    };
  }

  private async requireCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  /**
   * Transactional history summary for the staff Customer 360 (§3). Counts + the staff-actionable
   * open items (unpaid invoices, live auction participation, open offers/EOIs/tenders) + recent
   * purchases. Single-currency totals only — valid because the platform launches LKR-only.
   */
  async history(customerId: string) {
    const customer = await this.requireCustomer(customerId);
    const [maxes, offers, tenders, eois, invoices, sales, fulfilments] =
      await this.prisma.$transaction([
        this.prisma.bidderMax.findMany({
          where: { bidderId: customerId },
          include: { auction: { include: { listing: { include: { asset: true } } } } },
        }),
        this.prisma.offer.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.tenderBid.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.eoi.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
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
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.fulfilment.findMany({
          where: { listing: { sale: { buyerCustomerId: customerId } } },
          include: { listing: { include: { asset: true } } },
        }),
      ]);

    const openAuctions = maxes.filter((m) => m.auction.status === 'open');
    const wonAuctions = maxes.filter(
      (m) => m.auction.status === 'closed' && m.auction.winnerCustomerId === customerId,
    );
    const openOffers = offers.filter((o) => ['open', 'countered'].includes(o.status));
    const openEois = eois.filter((e) =>
      ['submitted', 'under_review', 'shortlisted', 'negotiating'].includes(e.status),
    );
    const openInvoices = invoices.filter((i) => i.status === 'issued');
    const deliveryPending = fulfilments.filter(
      (f) => !['collected', 'delivered', 'completed'].includes(f.state),
    );

    return {
      customer: {
        id: customer.id,
        clientReference: customer.clientReference,
        legalName: customer.legalName,
      },
      currency: PLATFORM_CURRENCY,
      summary: {
        activeAuctions: openAuctions.length,
        wonAuctions: wonAuctions.length,
        purchases: sales.length,
        purchaseValueMinor: sales.reduce((s, x) => s + Number(x.amountMinor), 0),
        openInvoices: openInvoices.length,
        openInvoicesMinor: openInvoices.reduce((s, i) => s + Number(i.amountDueMinor), 0),
        openOffers: openOffers.length,
        openEois: openEois.length,
        tenders: tenders.length,
        deliveryPending: deliveryPending.length,
      },
      openInvoices: openInvoices.map((i) => ({
        invoiceId: i.id,
        number: i.number,
        listing: this.label(i.listing),
        amountDueMinor: Number(i.amountDueMinor),
        currency: i.currency,
        dueAt: iso(i.dueAt),
      })),
      liveAuctions: openAuctions.map((m) => ({
        auctionId: m.auction.id,
        listing: this.label(m.auction.listing),
        winning: m.auction.highBidderId === customerId,
        currentBidMinor: num(m.auction.currentBidMinor ?? m.auction.openingBidMinor),
        endsAt: iso(m.auction.endsAt),
        currency: m.auction.currency,
      })),
      openOffers: openOffers.map((o) => ({
        offerId: o.id,
        listing: this.label(o.listing),
        status: o.status,
        amountMinor: Number(o.amountMinor),
        currency: o.currency,
      })),
      openEois: openEois.map((e) => ({
        eoiId: e.id,
        listing: this.label(e.listing),
        status: e.status,
        amountMinor: num(e.amountMinor),
        currency: e.currency,
      })),
      recentPurchases: sales.slice(0, 20).map((s) => ({
        saleId: s.id,
        listing: this.label(s.listing),
        amountMinor: Number(s.amountMinor),
        currency: s.currency,
        at: iso(s.createdAt),
      })),
    };
  }

  /**
   * Unified chronological timeline (§18) — one bounded, time-ordered merge of the customer's
   * touchpoints across every domain, plus the staff CRM notes/tasks. A projection: it reads the
   * owning records and never writes. `limit` bounds each source AND the merged result, so a very
   * active bidder cannot blow the response up.
   */
  async timeline(customerId: string, query: CrmTimelineQuery) {
    await this.requireCustomer(customerId);
    const take = query.limit;

    const [bids, offers, tenders, eois, invoices, sales, fulfilments, conversations, notes, tasks] =
      await this.prisma.$transaction([
        this.prisma.bid.findMany({
          where: { bidderId: customerId },
          orderBy: { placedAt: 'desc' },
          take,
          include: { auction: { include: { listing: { include: { asset: true } } } } },
        }),
        this.prisma.offer.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
          take,
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.tenderBid.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
          take,
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.eoi.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
          take,
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.invoice.findMany({
          where: { buyerCustomerId: customerId },
          orderBy: { createdAt: 'desc' },
          take,
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.sale.findMany({
          where: { buyerCustomerId: customerId },
          orderBy: { createdAt: 'desc' },
          take,
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.fulfilment.findMany({
          where: { listing: { sale: { buyerCustomerId: customerId } } },
          orderBy: { updatedAt: 'desc' },
          take,
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.conversation.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
          take,
        }),
        this.prisma.crmNote.findMany({
          where: { subjectType: 'customer', subjectId: customerId },
          orderBy: { createdAt: 'desc' },
          take,
        }),
        this.prisma.crmTask.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
          take,
        }),
      ]);

    const entries: TimelineEntry[] = [];

    for (const b of bids) {
      entries.push({
        at: b.placedAt.toISOString(),
        kind: 'bid',
        title: `Bid placed`,
        refType: 'Auction',
        refId: b.auctionId,
        listing: this.label(b.auction.listing),
        amountMinor: Number(b.amountMinor),
        currency: b.auction.currency,
        status: b.status,
      });
    }
    for (const o of offers) {
      entries.push({
        at: o.createdAt.toISOString(),
        kind: 'offer',
        title: o.sealed ? 'Sealed offer submitted' : 'Offer made',
        refType: 'Offer',
        refId: o.id,
        listing: this.label(o.listing),
        amountMinor: Number(o.amountMinor),
        currency: o.currency,
        status: o.status,
      });
    }
    for (const t of tenders) {
      entries.push({
        at: t.createdAt.toISOString(),
        kind: 'tender',
        title: 'Sealed tender bid',
        refType: 'TenderBid',
        refId: t.id,
        listing: this.label(t.listing),
        amountMinor: Number(t.amountMinor),
        currency: t.currency,
      });
    }
    for (const e of eois) {
      entries.push({
        at: e.createdAt.toISOString(),
        kind: 'eoi',
        title: 'Expression of interest',
        refType: 'Eoi',
        refId: e.id,
        listing: this.label(e.listing),
        amountMinor: num(e.amountMinor),
        currency: e.currency,
        status: e.status,
      });
    }
    for (const i of invoices) {
      entries.push({
        at: i.createdAt.toISOString(),
        kind: 'invoice',
        title: `Invoice ${i.number} ${i.status}`,
        refType: 'Invoice',
        refId: i.id,
        listing: this.label(i.listing),
        amountMinor: Number(i.amountDueMinor),
        currency: i.currency,
        status: i.status,
      });
    }
    for (const s of sales) {
      entries.push({
        at: s.createdAt.toISOString(),
        kind: 'sale',
        title: 'Purchase completed',
        refType: 'Sale',
        refId: s.id,
        listing: this.label(s.listing),
        amountMinor: Number(s.amountMinor),
        currency: s.currency,
      });
    }
    for (const f of fulfilments) {
      entries.push({
        at: f.updatedAt.toISOString(),
        kind: 'fulfilment',
        title: `Fulfilment: ${f.state.replace(/_/g, ' ')}`,
        refType: 'Fulfilment',
        refId: f.id,
        listing: this.label(f.listing),
        status: f.state,
      });
    }
    for (const c of conversations) {
      entries.push({
        at: c.createdAt.toISOString(),
        kind: 'conversation',
        title: `Conversation on ${c.channel}`,
        refType: 'Conversation',
        refId: c.id,
        status: c.status,
      });
    }
    for (const n of notes) {
      entries.push({
        at: n.createdAt.toISOString(),
        kind: 'note',
        title: 'Internal note added',
        refType: 'CrmNote',
        refId: n.id,
      });
    }
    for (const t of tasks) {
      entries.push({
        at: t.createdAt.toISOString(),
        kind: 'task',
        title: `Task: ${t.title}`,
        refType: 'CrmTask',
        refId: t.id,
        status: t.status,
      });
    }

    entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return { customerId, count: Math.min(entries.length, take), entries: entries.slice(0, take) };
  }

  /**
   * The staff CRM strip folded into member360 (§3/§19) — the customer's channel identities plus
   * a compact slice of the Singha-native CRM record (open tasks + most recent internal notes).
   * Staff-internal only; this is never merged into the customer self view.
   */
  async crmStrip(customerId: string) {
    const [channels, tasks, notes] = await Promise.all([
      this.prisma.externalIdentity.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.crm.listTasks({
        customerId,
        overdue: undefined,
        limit: 10,
        status: undefined,
        assigneeId: undefined,
        type: undefined,
      }),
      this.crm.listNotes({ subjectType: 'customer', subjectId: customerId, limit: 5 }),
    ]);
    const openTasks = tasks.filter((t) => !['done', 'cancelled'].includes(t.status));
    return {
      channels: channels.map((c) => ({
        channel: c.channel,
        externalId: c.externalId,
        verifiedAt: iso(c.verifiedAt),
      })),
      openTasks,
      recentNotes: notes,
    };
  }
}
