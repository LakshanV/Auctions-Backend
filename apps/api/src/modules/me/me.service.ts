import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PLATFORM_CURRENCY } from '@singha/config';
import { newId, type RecordProductEventInput } from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { type Principal } from '../../shared/auth/principal';

/** A lot as it appears in a command-centre status band. */
interface DashboardLot {
  listingId: string;
  reference: string;
  title: string;
  category: string;
  saleMethod: string;
  status: string;
  currency: string;
  amountMinor?: number | null;
  currentBidMinor?: number | null;
  endsAt?: string | null;
  deadlineAt?: string | null;
  note?: string;
}

interface DashboardGroup {
  key: string;
  label: string;
  items: DashboardLot[];
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const num = (v: bigint | null | undefined) => (v == null ? null : Number(v));

type ListingWithAsset = {
  id: string;
  publicRef: string;
  title: string | null;
  saleMethod: string;
  status: string;
  currency: string;
  closesAt: Date | null;
  asset: { category: string };
};

/**
 * Buyer command-centre projection (consolidated pack doc 05). A REBUILDABLE read
 * model over the authoritative tables — never a source of truth. Assembles the
 * urgent action strip plus status groups (Watching / Winning / Outbid / Payment
 * Due / Ready for Pickup / EOI / Offers / Tenders / Won) for the signed-in
 * customer, so the frontend renders them as Rubik status bands.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Record a privacy-safe product-analytics event for the dashboard pilot (pack doc
   * 08/09), gated on `dashboardV3Beta`. Append-only, PII-light: surface + action + an
   * optional listing/funnel step + a primitive metadata allow-list. Anonymous callers are
   * allowed (customerId null). 404 when the flag is OFF so the surface stays hidden.
   */
  async recordAnalytics(principal: Principal, input: RecordProductEventInput) {
    if (!this.config.get().features.dashboardV3Beta) throw new NotFoundException('Not found');
    await this.prisma.productEvent.create({
      data: {
        id: newId(),
        customerId: principal.customerId ?? null,
        anonymousSessionId: input.anonymousSessionId ?? null,
        surface: input.surface,
        action: input.action,
        listingId: input.listingId ?? null,
        funnelStep: input.funnelStep ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
    return { recorded: true };
  }

  private customerId(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  async dashboard(principal: Principal) {
    const customerId = this.customerId(principal);

    const [maxes, watches, eois, offers, tenders, invoices, sales, fulfilments] =
      await this.prisma.$transaction([
        this.prisma.bidderMax.findMany({
          where: { bidderId: customerId },
          include: { auction: { include: { listing: { include: { asset: true } } } } },
        }),
        this.prisma.watch.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
          include: { listing: { include: { asset: true, auction: true } } },
        }),
        this.prisma.eoi.findMany({
          where: { customerId },
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.offer.findMany({
          where: { customerId },
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.tenderBid.findMany({
          where: { customerId },
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.invoice.findMany({
          where: { buyerCustomerId: customerId },
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.sale.findMany({
          where: { buyerCustomerId: customerId },
          include: { listing: { include: { asset: true } } },
        }),
        this.prisma.fulfilment.findMany({
          where: { listing: { sale: { buyerCustomerId: customerId } } },
          include: { listing: { include: { asset: true } } },
        }),
      ]);

    const lotOf = (listing: ListingWithAsset, extra: Partial<DashboardLot> = {}): DashboardLot => ({
      listingId: listing.id,
      reference: listing.publicRef,
      title: listing.title ?? listing.asset.category,
      category: listing.asset.category,
      saleMethod: listing.saleMethod,
      status: listing.status,
      currency: listing.currency,
      endsAt: iso(listing.closesAt),
      ...extra,
    });

    // --- Auction participation (open + closed) --------------------------------
    const openMaxes = maxes.filter((m) => m.auction.status === 'open');
    const winning = openMaxes.filter((m) => m.auction.highBidderId === customerId);
    const outbid = openMaxes.filter((m) => m.auction.highBidderId !== customerId);
    const closedMaxes = maxes.filter((m) => m.auction.status === 'closed');
    const won = closedMaxes.filter((m) => m.auction.winnerCustomerId === customerId);
    const lost = closedMaxes.filter((m) => m.auction.winnerCustomerId !== customerId);
    const byEndsAsc = <T extends { auction: { endsAt: Date } }>(a: T, b: T) =>
      a.auction.endsAt.getTime() - b.auction.endsAt.getTime();

    const auctionLot = (m: (typeof maxes)[number]): DashboardLot =>
      lotOf(m.auction.listing, {
        currentBidMinor: num(m.auction.currentBidMinor ?? m.auction.openingBidMinor),
        endsAt: iso(m.auction.endsAt),
        note: `Your max ${m.auction.currency} ${(Number(m.maxMinor) / 100).toLocaleString()}`,
      });

    // --- Payment / fulfilment -------------------------------------------------
    const paymentDue = invoices.filter((i) => i.status === 'issued');
    const paid = invoices.filter((i) => i.status === 'paid');
    const readyPickup = fulfilments.filter((f) => f.state === 'ready_for_pickup');
    const deliveryPending = fulfilments.filter((f) =>
      ['pickup_booked', 'in_delivery'].includes(f.state),
    );
    const paymentDueMinor = paymentDue.reduce((sum, i) => sum + Number(i.amountDueMinor), 0);

    // EOIs surfaced per negotiation stage (pack 01 doc 09 — dedicated bands).
    const eoiBand = (status: string, key: string, label: string) =>
      band(
        key,
        label,
        eois
          .filter((e) => e.status === status)
          .map((e) => lotOf(e.listing, { amountMinor: num(e.amountMinor) })),
      );

    // Full command-centre band set (pack 01 doc 09). Empty bands are dropped
    // below, so a buyer only sees the ones that apply to them.
    const groups: DashboardGroup[] = [
      band(
        'WATCHING',
        'Watching',
        watches.map((w) =>
          lotOf(w.listing, {
            currentBidMinor: w.listing.auction
              ? num(w.listing.auction.currentBidMinor ?? w.listing.auction.openingBidMinor)
              : null,
            endsAt: iso(w.listing.auction?.endsAt ?? w.listing.closesAt),
          }),
        ),
      ),
      band('BIDDING', 'Bidding', [...openMaxes].sort(byEndsAsc).map(auctionLot)),
      band('WINNING', 'Winning', [...winning].sort(byEndsAsc).map(auctionLot)),
      band('OUTBID', 'Outbid', [...outbid].sort(byEndsAsc).map(auctionLot)),
      band('WON', 'Won at auction', won.map(auctionLot)),
      band('LOST', 'Lost', lost.map(auctionLot)),
      band(
        'PAYMENT_DUE',
        'Payment due',
        [...paymentDue]
          .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
          .map((i) =>
            lotOf(i.listing, {
              amountMinor: Number(i.amountDueMinor),
              deadlineAt: iso(i.dueAt),
              note: `Invoice ${i.number}`,
            }),
          ),
      ),
      band(
        'PAID',
        'Paid',
        paid.map((i) =>
          lotOf(i.listing, { amountMinor: Number(i.amountDueMinor), note: `Invoice ${i.number}` }),
        ),
      ),
      band(
        'READY_FOR_PICKUP',
        'Ready for pickup',
        readyPickup.map((f) => lotOf(f.listing)),
      ),
      band(
        'DELIVERY_PENDING',
        'Delivery pending',
        deliveryPending.map((f) => lotOf(f.listing, { note: f.state.replace(/_/g, ' ') })),
      ),
      eoiBand('submitted', 'EOI_SUBMITTED', 'EOI submitted'),
      eoiBand('under_review', 'EOI_UNDER_REVIEW', 'EOI under review'),
      eoiBand('shortlisted', 'EOI_SHORTLISTED', 'EOI shortlisted'),
      eoiBand('negotiating', 'EOI_NEGOTIATING', 'EOI negotiating'),
      band(
        'OFFERS_ACTIVE',
        'Offers',
        offers
          .filter((o) => ['open', 'countered'].includes(o.status))
          .map((o) => lotOf(o.listing, { amountMinor: Number(o.amountMinor) })),
      ),
      band(
        'TENDERS_SUBMITTED',
        'Sealed tenders',
        tenders.map((t) => lotOf(t.listing, { amountMinor: Number(t.amountMinor) })),
      ),
      band(
        'PAST_PURCHASES',
        'Past purchases',
        sales.map((s) => lotOf(s.listing, { amountMinor: Number(s.amountMinor) })),
      ),
    ];

    return {
      strip: {
        activeBids: openMaxes.length,
        winning: winning.length,
        outbid: outbid.length,
        // Single-currency total: valid only because the platform launches
        // LKR-only (see PLATFORM_CURRENCY). Multi-currency must not sum here.
        paymentDueMinor,
        readyForPickup: readyPickup.length,
        currency: PLATFORM_CURRENCY,
      },
      groups: groups.filter((g) => g.items.length > 0),
    };
  }
}

function band(key: string, label: string, items: DashboardLot[]): DashboardGroup {
  return { key, label, items };
}
