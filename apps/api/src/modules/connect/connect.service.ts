import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateBidIntentInput,
  DomainEventName,
  type InboundMessageInput,
  type SendMessageInput,
  type SetAiModeInput,
  newId,
} from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { AuctionService } from '../auction/auction.service';
import { CHANNEL_PROVIDER, type MessageChannelProvider } from './channel.provider';

// Non-web channels map to the 'absentee' bid source in the one ledger (docs/07).
const CHANNEL_BID_SOURCE: Record<string, 'online' | 'absentee'> = {
  web: 'online',
  whatsapp: 'absentee',
  facebook: 'absentee',
  instagram: 'absentee',
  email: 'absentee',
  sms: 'absentee',
};

/**
 * Singha Connect (docs/09): one customer identity + conversation history across
 * channels, providers behind an adapter. Messaging-channel bidding follows rule
 * 11 — free text creates a BidIntent (never a bid); an explicit confirmation is
 * validated by the authoritative auction engine before any bid exists.
 */
@Injectable()
export class ConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly auctions: AuctionService,
    @Inject(CHANNEL_PROVIDER) private readonly channel: MessageChannelProvider,
  ) {}

  /** Ingest an inbound message; resolve the customer via a VERIFIED external identity. */
  async inbound(principal: Principal, input: InboundMessageInput) {
    const actor = toActor(principal);
    // Identity resolution: only a verified external identity links to a customer
    // (docs/09 — never merge accounts on weak inference).
    const identity = input.externalUserId
      ? await this.prisma.externalIdentity.findUnique({
          where: {
            channel_externalId: { channel: input.channel, externalId: input.externalUserId },
          },
        })
      : null;
    const customerId = identity?.verifiedAt ? identity.customerId : null;

    return this.uow.execute(actor, async (ctx) => {
      const conversation = await ctx.tx.conversation.upsert({
        where: {
          channel_externalThreadId: {
            channel: input.channel,
            externalThreadId: input.externalThreadId,
          },
        },
        update: { customerId: customerId ?? undefined },
        create: {
          id: newId(),
          channel: input.channel,
          externalThreadId: input.externalThreadId,
          customerId,
          status: 'open',
          aiMode: true,
        },
      });
      const message = await ctx.tx.message.create({
        data: {
          id: newId(),
          conversationId: conversation.id,
          direction: 'inbound',
          providerMessageId: input.providerMessageId,
          sender: input.externalUserId,
          text: input.text,
          provenance: 'customer',
        },
      });
      ctx.emit({
        name: DomainEventName.InboundMessageReceived,
        aggregateType: 'Conversation',
        aggregateId: conversation.id,
        payload: {
          conversationId: conversation.id,
          channel: input.channel,
          resolved: Boolean(customerId),
        },
      });
      ctx.audit({
        action: 'INBOUND_MESSAGE',
        targetType: 'Conversation',
        targetId: conversation.id,
      });
      return {
        conversationId: conversation.id,
        messageId: message.id,
        customerResolved: Boolean(customerId),
        aiMode: conversation.aiMode,
      };
    });
  }

  /** Staff/AI outbound reply — sent via the channel adapter (mock in dev). */
  async send(principal: Principal, conversationId: string, input: SendMessageInput) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const sent = await this.channel.send(
      conversation.channel,
      conversation.externalThreadId,
      input.text,
    );
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const message = await ctx.tx.message.create({
        data: {
          id: newId(),
          conversationId,
          direction: 'outbound',
          providerMessageId: sent.providerMessageId,
          text: input.text,
          provenance: input.provenance,
        },
      });
      ctx.audit({
        action: 'OUTBOUND_MESSAGE',
        targetType: 'Conversation',
        targetId: conversationId,
      });
      return {
        messageId: message.id,
        providerMessageId: sent.providerMessageId,
        via: this.channel.name,
      };
    });
  }

  /** Toggle AI ↔ human handling (docs/09 handoff). */
  async setMode(principal: Principal, conversationId: string, input: SetAiModeInput) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.conversation.update({
        where: { id: conversationId },
        data: {
          aiMode: input.aiMode,
          assignedAgentId: input.aiMode ? null : (principal.customerId ?? 'staff'),
          status: input.aiMode ? conversation.status : 'pending',
        },
      });
      ctx.audit({
        action: input.aiMode ? 'CONVERSATION_TO_AI' : 'CONVERSATION_TO_HUMAN',
        targetType: 'Conversation',
        targetId: conversationId,
      });
      return { conversationId, aiMode: updated.aiMode, assignedAgentId: updated.assignedAgentId };
    });
  }

  async conversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return {
      id: conversation.id,
      channel: conversation.channel,
      customerId: conversation.customerId,
      status: conversation.status,
      aiMode: conversation.aiMode,
      assignedAgentId: conversation.assignedAgentId,
      messages: conversation.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        text: m.text,
        provenance: m.provenance,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Create a bid INTENT from a channel (rule 11). Returns the lot/amount/context
   * the buyer must confirm — NOTHING is bid yet.
   */
  async createBidIntent(principal: Principal, input: CreateBidIntentInput) {
    const customerId = principal.customerId;
    if (!customerId) throw new ForbiddenException('A linked, authenticated customer is required');
    const auction = await this.prisma.auction.findUnique({
      where: { id: input.auctionId },
      include: { listing: { include: { asset: true } } },
    });
    if (!auction) throw new NotFoundException('Auction not found');

    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.bidIntent.create({
        data: {
          id,
          customerId,
          auctionId: input.auctionId,
          maxAmountMinor: BigInt(input.maxAmountMinor),
          channel: input.channel,
          status: 'pending',
        },
      });
      ctx.emit({
        name: DomainEventName.BidIntentCreated,
        aggregateType: 'BidIntent',
        aggregateId: id,
        payload: { bidIntentId: id, auctionId: input.auctionId, customerId },
      });
      ctx.audit({ action: 'BID_INTENT_CREATED', targetType: 'BidIntent', targetId: id });
      // Confirmation prompt payload (lot + amount + fee/term context).
      return {
        bidIntentId: id,
        status: 'pending',
        confirmationRequired: true,
        lot: {
          title: auction.listing.title,
          publicRef: auction.listing.publicRef,
          category: auction.listing.asset.category,
        },
        maxAmountMinor: input.maxAmountMinor,
        currency: auction.currency,
        currentBidMinor: auction.currentBidMinor == null ? null : Number(auction.currentBidMinor),
        buyerPremiumPct: auction.buyerPremiumPct,
      };
    });
  }

  /**
   * Explicit confirmation → the intent is validated by the AUTHORITATIVE auction
   * engine (same row-locked path as any bid). Single-use.
   */
  async confirmBidIntent(principal: Principal, id: string) {
    const intent = await this.prisma.bidIntent.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException('Bid intent not found');
    if (intent.customerId !== principal.customerId) {
      throw new ForbiddenException('You can only confirm your own bid intent');
    }
    if (intent.status !== 'pending') {
      throw new ConflictException(`Bid intent is ${intent.status}, not pending`);
    }

    // Delegate to the auction engine — the intent never bypasses validation.
    const source = CHANNEL_BID_SOURCE[intent.channel] ?? 'online';
    const result = await this.auctions.placeBid(principal, intent.auctionId, {
      maxAmountMinor: Number(intent.maxAmountMinor),
      source,
      idempotencyKey: `intent-${id}`,
    });

    const actor = toActor(principal);
    await this.uow.execute(actor, async (ctx) => {
      await ctx.tx.bidIntent.update({
        where: { id },
        data: { status: 'placed', confirmedAt: new Date() },
      });
      ctx.emit({
        name: DomainEventName.BidIntentConfirmed,
        aggregateType: 'BidIntent',
        aggregateId: id,
        payload: { bidIntentId: id, auctionId: intent.auctionId },
      });
      ctx.audit({ action: 'BID_INTENT_CONFIRMED', targetType: 'BidIntent', targetId: id });
    });
    return { bidIntentId: id, status: 'placed', bid: result };
  }
}
