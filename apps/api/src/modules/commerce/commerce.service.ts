import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AdvanceFulfilmentInput,
  DomainEventName,
  type IssueInvoiceInput,
  Permission,
  type RecordPaymentInput,
  type SettleInput,
  type VerifyPaymentInput,
  newId,
} from '@singha/contracts';
import {
  type FulfilmentState,
  assertFulfilmentTransition,
  computeInvoice,
  computeSettlement,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { UnitOfWork, type UowContext } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { CreditExposureService } from '../member/credit-exposure.service';

/**
 * Commerce pipeline (docs/14): a won/accepted sale continues through invoice →
 * payment → release → fulfilment → seller settlement. The authoritative money
 * record is the APPEND-ONLY ledger (a DB trigger blocks UPDATE/DELETE); figures
 * here are derived, never a mutable balance. Release/settlement need server
 * state, never a customer screenshot.
 */
@Injectable()
export class CommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly config: AppConfigService,
    private readonly exposure: CreditExposureService,
  ) {}

  async issueInvoice(principal: Principal, input: IssueInvoiceInput) {
    const sale = await this.prisma.sale.findUnique({ where: { listingId: input.listingId } });
    if (!sale) throw new ConflictException('Listing has no confirmed sale to invoice');
    const existing = await this.prisma.invoice.findUnique({
      where: { listingId: input.listingId },
    });
    if (existing) throw new ConflictException('Invoice already issued for this listing');

    const business = this.config.get().business;
    const comp = computeInvoice(
      Number(sale.amountMinor),
      { buyerPremiumPct: business.buyerPremiumPct, taxPct: business.taxPct },
      { otherFeesMinor: input.otherFeesMinor, depositAppliedMinor: input.depositAppliedMinor },
    );
    const id = newId();
    const number = `INV-${new Date().getFullYear()}-${id.slice(-10)}`;
    const dueAt = new Date(Date.now() + business.paymentDeadlineHours * 3_600_000);

    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const invoice = await ctx.tx.invoice.create({
        data: {
          id,
          number,
          listingId: input.listingId,
          saleId: sale.id,
          buyerCustomerId: sale.buyerCustomerId,
          currency: sale.currency,
          hammerMinor: BigInt(comp.hammerMinor),
          buyerPremiumMinor: BigInt(comp.buyerPremiumMinor),
          taxMinor: BigInt(comp.taxMinor),
          otherFeesMinor: BigInt(comp.otherFeesMinor),
          depositAppliedMinor: BigInt(comp.depositAppliedMinor),
          amountDueMinor: BigInt(comp.amountDueMinor),
          status: 'issued',
          dueAt,
        },
      });
      // Charge lines as append-only ledger events.
      await this.ledger(
        ctx,
        input.listingId,
        id,
        'sale_charge',
        comp.hammerMinor,
        sale.currency,
        actor,
      );
      if (comp.buyerPremiumMinor > 0)
        await this.ledger(
          ctx,
          input.listingId,
          id,
          'buyer_premium',
          comp.buyerPremiumMinor,
          sale.currency,
          actor,
        );
      if (comp.taxMinor > 0)
        await this.ledger(ctx, input.listingId, id, 'tax', comp.taxMinor, sale.currency, actor);
      if (comp.depositAppliedMinor > 0)
        await this.ledger(
          ctx,
          input.listingId,
          id,
          'credit_applied',
          -comp.depositAppliedMinor,
          sale.currency,
          actor,
        );

      await ctx.tx.fulfilment.upsert({
        where: { listingId: input.listingId },
        update: {},
        create: { id: newId(), listingId: input.listingId, state: 'payment_pending' },
      });
      ctx.emit({
        name: DomainEventName.InvoiceIssued,
        aggregateType: 'Invoice',
        aggregateId: id,
        payload: { invoiceId: id, listingId: input.listingId, amountDueMinor: comp.amountDueMinor },
      });
      ctx.audit({ action: 'INVOICE_ISSUED', targetType: 'Invoice', targetId: id });
      return this.invoiceView(invoice);
    });
  }

  async getInvoice(principal: Principal, id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    this.assertInvoiceReadable(principal, invoice.buyerCustomerId);
    return {
      ...this.invoiceView(invoice),
      payments: invoice.payments.map((p) => this.paymentView(p)),
    };
  }

  async recordPayment(principal: Principal, invoiceId: string, input: RecordPaymentInput) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.buyerCustomerId !== principal.customerId) {
      throw new ForbiddenException('You can only pay your own invoice');
    }
    if (invoice.status === 'paid') throw new ConflictException('Invoice already paid');

    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const payment = await ctx.tx.payment.create({
        data: {
          id,
          invoiceId,
          amountMinor: BigInt(input.amountMinor),
          method: input.method,
          status: 'pending_verification',
          proofRef: input.proofRef,
        },
      });
      // NB: no ledger entry yet — proof of payment is not payment (docs/14).
      ctx.audit({ action: 'PAYMENT_SUBMITTED', targetType: 'Payment', targetId: id });
      return this.paymentView(payment);
    });
  }

  async verifyPayment(principal: Principal, paymentId: string, input: VerifyPaymentInput) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'pending_verification') {
      throw new ConflictException('Payment is not pending verification');
    }

    const actor = toActor(principal);
    const confirm = input.decision === 'confirm';
    return this.uow.execute(actor, async (ctx) => {
      // Conditional claim: only ONE concurrent verify may transition the payment out of
      // pending_verification. The status guard above runs OUTSIDE the transaction and cannot stop
      // a double-confirm race on its own — without this predicate both racers would each append a
      // `payment_received` row to the immutable ledger, over-stating the paid total. The loser
      // matches 0 rows and rolls back with a clean 409.
      const claimed = await ctx.tx.payment.updateMany({
        where: { id: paymentId, status: 'pending_verification' },
        data: {
          status: confirm ? 'confirmed' : 'rejected',
          verifiedBy: principal.customerId ?? 'staff',
          verifiedAt: new Date(),
        },
      });
      if (claimed.count === 0) throw new ConflictException('Payment is not pending verification');
      const updated = await ctx.tx.payment.findUnique({ where: { id: paymentId } });
      if (!updated) throw new NotFoundException('Payment not found');
      if (confirm) {
        await this.ledger(
          ctx,
          payment.invoice.listingId,
          payment.invoiceId,
          'payment_received',
          Number(payment.amountMinor),
          payment.invoice.currency,
          actor,
        );
        // Total confirmed vs due → mark paid + advance fulfilment.
        const confirmedAgg = await ctx.tx.payment.aggregate({
          where: { invoiceId: payment.invoiceId, status: 'confirmed' },
          _sum: { amountMinor: true },
        });
        const paid = Number(confirmedAgg._sum.amountMinor ?? 0);
        if (paid >= Number(payment.invoice.amountDueMinor)) {
          await ctx.tx.invoice.update({
            where: { id: payment.invoiceId },
            data: { status: 'paid' },
          });
          await this.moveFulfilment(ctx, payment.invoice.listingId, 'payment_confirmed');
          // Paid → release the buyer's committed purchase exposure (Revision 05 §16).
          await this.exposure.releaseForSale(ctx, payment.invoice.saleId);
          ctx.emit({
            name: DomainEventName.PaymentConfirmed,
            aggregateType: 'Invoice',
            aggregateId: payment.invoiceId,
            payload: { invoiceId: payment.invoiceId, listingId: payment.invoice.listingId },
          });
        }
      }
      ctx.audit({
        action: confirm ? 'PAYMENT_CONFIRMED' : 'PAYMENT_REJECTED',
        targetType: 'Payment',
        targetId: paymentId,
      });
      return this.paymentView(updated);
    });
  }

  async release(principal: Principal, listingId: string) {
    const fulfilment = await this.requireFulfilment(listingId);
    if (fulfilment.state !== 'payment_confirmed') {
      throw new ConflictException('Release requires a confirmed payment');
    }
    const actor = toActor(principal);
    const releaseRef = `REL-${newId().slice(-10)}`;
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.fulfilment.update({
        where: { listingId },
        data: { state: 'release_approved', releaseRef },
      });
      ctx.emit({
        name: DomainEventName.ReleaseApproved,
        aggregateType: 'Listing',
        aggregateId: listingId,
        payload: { listingId, releaseRef },
      });
      ctx.audit({ action: 'RELEASE_APPROVED', targetType: 'Listing', targetId: listingId });
      return this.fulfilmentView(updated);
    });
  }

  async advanceFulfilment(principal: Principal, listingId: string, input: AdvanceFulfilmentInput) {
    const fulfilment = await this.requireFulfilment(listingId);
    assertFulfilmentTransition(fulfilment.state, input.state);
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.fulfilment.update({
        where: { listingId },
        data: { state: input.state },
      });
      if (input.state === 'collected' || input.state === 'delivered') {
        ctx.emit({
          name: DomainEventName.ItemCollected,
          aggregateType: 'Listing',
          aggregateId: listingId,
          payload: { listingId, via: input.state },
        });
      }
      ctx.audit({
        action: `FULFILMENT_${input.state.toUpperCase()}`,
        targetType: 'Listing',
        targetId: listingId,
      });
      return this.fulfilmentView(updated);
    });
  }

  async settle(principal: Principal, listingId: string, input: SettleInput) {
    const sale = await this.prisma.sale.findUnique({ where: { listingId } });
    if (!sale) throw new ConflictException('No sale to settle');
    const existing = await this.prisma.settlement.findUnique({ where: { listingId } });
    if (existing) throw new ConflictException('Listing already settled');
    const invoice = await this.prisma.invoice.findUnique({ where: { listingId } });
    if (!invoice || invoice.status !== 'paid') {
      throw new ConflictException('Settle only after the buyer invoice is paid');
    }

    const business = this.config.get().business;
    const comp = computeSettlement(
      Number(sale.amountMinor),
      { sellerCommissionPct: business.sellerCommissionPct, taxPct: business.taxPct },
      { deductionsMinor: input.deductionsMinor },
    );
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const settlement = await ctx.tx.settlement.create({
        data: {
          id,
          listingId,
          saleProceedsMinor: BigInt(comp.saleProceedsMinor),
          commissionMinor: BigInt(comp.commissionMinor),
          commissionTaxMinor: BigInt(comp.commissionTaxMinor),
          deductionsMinor: BigInt(comp.deductionsMinor),
          netMinor: BigInt(comp.netMinor),
          reference: input.reference,
          reason: input.reason,
        },
      });
      await this.ledger(
        ctx,
        listingId,
        invoice.id,
        'settlement_disbursed',
        comp.netMinor,
        sale.currency,
        actor,
      );
      ctx.emit({
        name: DomainEventName.SellerSettled,
        aggregateType: 'Listing',
        aggregateId: listingId,
        payload: { listingId, netMinor: comp.netMinor },
      });
      ctx.audit({ action: 'SELLER_SETTLED', targetType: 'Settlement', targetId: id });
      return this.settlementView(settlement);
    });
  }

  /** Append-only ledger view for a listing (docs/14). */
  async ledgerFor(listingId: string) {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { listingId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((e) => ({
      id: e.id,
      entryType: e.entryType,
      amountMinor: Number(e.amountMinor),
      currency: e.currency,
      reference: e.reference,
      createdAt: e.createdAt,
    }));
  }

  /**
   * Institutional Evidence Pack (docs/14): a permission-aware record bundling the
   * listing, auction config + bid timeline, result, invoice/payment, release and
   * settlement, with audit references. Readable by staff or the buyer.
   */
  async evidencePack(principal: Principal, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        asset: true,
        auction: true,
        sale: true,
        invoice: { include: { payments: true } },
        fulfilment: true,
        settlement: true,
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    this.assertInvoiceReadable(principal, listing.sale?.buyerCustomerId ?? null);

    const bids = listing.auction
      ? await this.prisma.bid.findMany({
          where: { auctionId: listing.auction.id },
          orderBy: { sequence: 'asc' },
        })
      : [];
    const audits = await this.prisma.auditEvent.findMany({
      where: {
        targetId: {
          in: [listingId, listing.auction?.id ?? listingId, listing.invoice?.id ?? listingId],
        },
      },
      orderBy: { occurredAt: 'asc' },
      select: { id: true, action: true, targetType: true, occurredAt: true },
    });

    return {
      listing: {
        id: listing.id,
        publicRef: listing.publicRef,
        title: listing.title,
        status: listing.status,
        category: listing.asset.category,
      },
      auction: listing.auction
        ? {
            id: listing.auction.id,
            openingBidMinor: Number(listing.auction.openingBidMinor),
            incrementMinor: Number(listing.auction.incrementMinor),
            extendedCount: listing.auction.extendedCount,
            softCloseTriggerSec: listing.auction.softCloseTriggerSec,
            softCloseExtendSec: listing.auction.softCloseExtendSec,
            winnerCustomerId: listing.auction.winnerCustomerId,
            soldAt: listing.auction.soldAt,
          }
        : null,
      bidTimeline: bids.map((b) => ({
        sequence: b.sequence,
        amountMinor: Number(b.amountMinor),
        source: b.source,
        placedAt: b.placedAt,
      })),
      softCloseExtensions: listing.auction?.extendedCount ?? 0,
      sale: listing.sale
        ? {
            channel: listing.sale.channel,
            amountMinor: Number(listing.sale.amountMinor),
            buyerCustomerId: listing.sale.buyerCustomerId,
          }
        : null,
      invoice: listing.invoice
        ? {
            number: listing.invoice.number,
            amountDueMinor: Number(listing.invoice.amountDueMinor),
            status: listing.invoice.status,
            payments: listing.invoice.payments.map((p) => this.paymentView(p)),
          }
        : null,
      release: listing.fulfilment
        ? { state: listing.fulfilment.state, releaseRef: listing.fulfilment.releaseRef }
        : null,
      settlement: listing.settlement ? this.settlementView(listing.settlement) : null,
      ledger: await this.ledgerFor(listingId),
      auditReferences: audits,
      generatedAt: new Date().toISOString(),
    };
  }

  // --- helpers --------------------------------------------------------------

  private async ledger(
    ctx: UowContext,
    listingId: string,
    invoiceId: string | null,
    entryType: string,
    amountMinor: number,
    currency: string,
    actor: { type: 'customer' | 'staff' | 'system' | 'ai'; id: string | null },
  ) {
    await ctx.tx.ledgerEntry.create({
      data: {
        id: newId(),
        listingId,
        invoiceId,
        entryType: entryType as never,
        amountMinor: BigInt(amountMinor),
        currency,
        actorType: actor.type,
        actorId: actor.id,
      },
    });
  }

  private async moveFulfilment(ctx: UowContext, listingId: string, to: FulfilmentState) {
    const current = await ctx.tx.fulfilment.findUnique({ where: { listingId } });
    if (current) assertFulfilmentTransition(current.state, to);
    await ctx.tx.fulfilment.update({ where: { listingId }, data: { state: to } });
  }

  private assertInvoiceReadable(principal: Principal, buyerCustomerId: string | null) {
    const isStaff = principal.permissions.has(Permission.CommerceOperate);
    if (!isStaff && (!buyerCustomerId || buyerCustomerId !== principal.customerId)) {
      throw new ForbiddenException('Not permitted to view this record');
    }
  }

  private async requireFulfilment(listingId: string) {
    const f = await this.prisma.fulfilment.findUnique({ where: { listingId } });
    if (!f) throw new NotFoundException('Fulfilment not found (invoice first)');
    return f;
  }

  private invoiceView(i: {
    id: string;
    number: string;
    listingId: string;
    buyerCustomerId: string;
    currency: string;
    hammerMinor: bigint;
    buyerPremiumMinor: bigint;
    taxMinor: bigint;
    amountDueMinor: bigint;
    status: string;
    dueAt: Date;
  }) {
    return {
      id: i.id,
      number: i.number,
      listingId: i.listingId,
      buyerCustomerId: i.buyerCustomerId,
      currency: i.currency,
      hammerMinor: Number(i.hammerMinor),
      buyerPremiumMinor: Number(i.buyerPremiumMinor),
      taxMinor: Number(i.taxMinor),
      amountDueMinor: Number(i.amountDueMinor),
      status: i.status,
      dueAt: i.dueAt,
    };
  }

  private paymentView(p: {
    id: string;
    amountMinor: bigint;
    method: string;
    status: string;
    proofRef: string | null;
  }) {
    return {
      id: p.id,
      amountMinor: Number(p.amountMinor),
      method: p.method,
      status: p.status,
      proofRef: p.proofRef,
    };
  }

  private settlementView(s: {
    listingId: string;
    saleProceedsMinor: bigint;
    commissionMinor: bigint;
    commissionTaxMinor: bigint;
    deductionsMinor: bigint;
    netMinor: bigint;
    reference: string | null;
  }) {
    return {
      listingId: s.listingId,
      saleProceedsMinor: Number(s.saleProceedsMinor),
      commissionMinor: Number(s.commissionMinor),
      commissionTaxMinor: Number(s.commissionTaxMinor),
      deductionsMinor: Number(s.deductionsMinor),
      netMinor: Number(s.netMinor),
      reference: s.reference,
    };
  }

  private fulfilmentView(f: { listingId: string; state: string; releaseRef: string | null }) {
    return { listingId: f.listingId, state: f.state, releaseRef: f.releaseRef };
  }
}
