import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Actor,
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
import { parseContinuityToken } from '../../shared/auth/continuity-token';
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

    // AIC-2 cross-channel continuity (constraint 2): a continuityToken means this inbound
    // message claims to CONTINUE an existing conversation from another channel, not start a new
    // one. Branch BEFORE the ordinary upsert-by-(channel,externalThreadId) below, which would
    // otherwise mint a second Conversation row for the new channel — exactly the duplicate this
    // flow must prevent.
    if (input.continuityToken) {
      return this.inboundContinuation(actor, input, customerId);
    }

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

  /**
   * AIC-2 continuation ingress (docs/09 "one conversation across channels", constraint 2). Never
   * creates a Conversation row — it only ATTACHES to the one the continuityToken names, and only
   * after re-deriving the customer the exact same way `inbound()` above does for every ordinary
   * message (a `verifiedAt`-stamped `ExternalIdentity` for THIS channel/externalUserId — the
   * token itself is never trusted for identity, see continuity-token.ts).
   *
   * Denies (404, matching D-0040's existing "never 403" stance so a guess can't confirm a
   * conversation exists) unless ALL of:
   *   1. the token parses to a well-formed {conversationId, customerId};
   *   2. that conversation actually exists;
   *   3. the token's OWN claimed customerId matches the origin conversation's stored
   *      customerId (defence in depth — catches a stale/rewritten token even before identity
   *      re-resolution runs);
   *   4. the customerId just re-resolved from THIS request's verified external identity matches
   *      the origin conversation's stored customerId (the actual authority — constraint 2's
   *      "re-resolve, then compare").
   * This covers unverified identities (`resolvedCustomerId` is null), cross-customer attempts
   * (resolved customer != origin owner) and forged tokens (parsed customerId != origin owner)
   * identically — all denied.
   */
  private async inboundContinuation(
    actor: Actor,
    input: InboundMessageInput,
    resolvedCustomerId: string | null,
  ) {
    const parsed = parseContinuityToken(input.continuityToken!);
    const origin = parsed
      ? await this.prisma.conversation.findUnique({ where: { id: parsed.conversationId } })
      : null;

    if (
      !parsed ||
      !origin ||
      !resolvedCustomerId ||
      origin.customerId !== parsed.customerId ||
      origin.customerId !== resolvedCustomerId
    ) {
      throw new NotFoundException('Conversation not found');
    }

    return this.uow.execute(actor, async (ctx) => {
      // Preserve context (build-section requirement): carry forward the origin conversation's
      // latest item-context `subject` snapshot, straight from its own history — never
      // re-derived/guessed — so the continued channel keeps the same lot/topic in view.
      const priorSubjectMessage = await ctx.tx.message.findFirst({
        where: { conversationId: origin.id, provenance: 'customer' },
        orderBy: { createdAt: 'desc' },
      });
      const priorSubject = (priorSubjectMessage?.payload as unknown as { subject?: unknown } | null)
        ?.subject;

      const message = await ctx.tx.message.create({
        data: {
          id: newId(),
          conversationId: origin.id,
          direction: 'inbound',
          providerMessageId: input.providerMessageId,
          sender: input.externalUserId,
          text: input.text,
          provenance: 'customer',
          payload: {
            continuity: { fromChannel: input.channel },
            ...(priorSubject !== undefined ? { subject: priorSubject } : {}),
          } as unknown as object,
        },
      });
      ctx.emit({
        name: DomainEventName.InboundMessageReceived,
        aggregateType: 'Conversation',
        aggregateId: origin.id,
        payload: {
          conversationId: origin.id,
          channel: input.channel,
          resolved: true,
          continued: true,
        },
      });
      ctx.audit({
        action: 'CONVERSATION_CONTINUED',
        targetType: 'Conversation',
        targetId: origin.id,
      });
      return {
        conversationId: origin.id,
        messageId: message.id,
        customerResolved: true,
        aiMode: origin.aiMode,
        continued: true,
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

  /**
   * Agent-facing conversation view. AIC-2 "human handoff context": `messages` now carries
   * `payload` too (previously dropped) — the ONLY place item-context/channel-request/
   * continuity metadata actually lives, so an agent who takes over via `setMode` could not
   * otherwise see the lot the customer was asking about. `handoffSummary` is a DERIVED read
   * (no new table — build-section note) computed from that same history: the customer's most
   * recent message text + its item-context `subject`, if any. `setMode` itself never touches
   * messages, so this view is already complete across an AI->human handoff by construction;
   * see connect.service.spec.ts for the test proving it.
   */
  async conversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const lastCustomerMessage = [...conversation.messages]
      .reverse()
      .find((m) => m.provenance === 'customer');
    const handoffSummary = lastCustomerMessage
      ? {
          latestQuestion: lastCustomerMessage.text,
          itemContext:
            (lastCustomerMessage.payload as unknown as { subject?: unknown } | null)?.subject ??
            null,
        }
      : null;

    return {
      id: conversation.id,
      channel: conversation.channel,
      customerId: conversation.customerId,
      status: conversation.status,
      aiMode: conversation.aiMode,
      assignedAgentId: conversation.assignedAgentId,
      handoffSummary,
      messages: conversation.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        text: m.text,
        provenance: m.provenance,
        payload: m.payload,
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
