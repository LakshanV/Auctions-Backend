import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type AskAssistantInput, newId } from '@singha/contracts';
import { guardAiRequest } from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { AI_PROVIDER, type AiProvider } from '../ai/ai.provider';
import { CatalogueV2Service } from '../catalogue/catalogue-v2.service';
import {
  type ItemContext,
  suggestionsForSaleMethod,
  toItemContext,
} from './assistant.item-context';

// Mirrors ai.service.ts's SAFE_REFUSAL (kept local — this module only reaches into ai.module
// through the sanctioned AI_PROVIDER token, never its internals).
const SAFE_REFUSAL =
  'I can’t help with that request. A Singha specialist can assist you with anything about a lot, bidding or your account.';

/**
 * AIC-1 — customer-facing AI conversation assistant (docs/10 "Customer AI"). Extends the existing
 * Singha Connect `Conversation`/`Message` models and the Singha AI Core `AiRun` governance record
 * — no new tables. Non-binding (rule 11): this service NEVER creates a bid/offer/EOI; it only
 * answers and suggests. Mirrors `AiService.assist()`'s guard → provider → AiRun flow.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly config: AppConfigService,
    private readonly catalogue: CatalogueV2Service,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  private requireFeature(): void {
    if (!this.config.get().features.aiConversation) {
      throw new NotFoundException('The AI conversation assistant is not enabled');
    }
  }

  private requireCustomerId(principal: Principal): string {
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return principal.customerId;
  }

  /**
   * Load (ownership-checked) or mint a fresh 'web' Conversation id for this customer. Returns
   * `existingId: null` when a new conversation must be created inside the transaction below —
   * done there (not here) so an unlucky throw between the two never leaves an orphan row.
   */
  private async resolveConversationId(
    customerId: string,
    conversationId: string | undefined,
  ): Promise<{ id: string; isNew: boolean }> {
    if (!conversationId) return { id: newId(), isNew: true };

    const existing = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    // Ownership scoping (constraint 3): a customer may only continue THEIR OWN conversation, and
    // only the 'web' channel this assistant owns. Not-found and not-yours both 404 — never 403 —
    // so a guess can't be used to confirm another customer's conversation exists.
    if (!existing || existing.customerId !== customerId || existing.channel !== 'web') {
      throw new NotFoundException('Conversation not found');
    }
    return { id: existing.id, isNew: false };
  }

  async ask(principal: Principal, input: AskAssistantInput) {
    // Constraint 4: enforced BEFORE any datastore access — flag off creates nothing.
    this.requireFeature();
    const customerId = this.requireCustomerId(principal);
    const { id: conversationId, isNew } = await this.resolveConversationId(
      customerId,
      input.conversationId,
    );

    // Constraint 2 (DTO privacy/anti-clone): the ONLY source for per-lot context is
    // CatalogueV2Service.get() — already privacy-filtered (no reserve/proxy/seller floor/KYC/
    // risk/staff notes/valuations/routing weights). Mapped through the ItemContext allowlist.
    const itemContext = input.listingId
      ? toItemContext(await this.catalogue.get(input.listingId), input.url)
      : undefined;

    const actor = toActor(principal);
    const customerMessageId = newId();
    const aiRunId = newId();

    return this.uow.execute(actor, async (ctx) => {
      if (isNew) {
        await ctx.tx.conversation.create({
          data: {
            id: conversationId,
            customerId,
            channel: 'web',
            externalThreadId: `web:${customerId}:${conversationId}`,
            status: 'open',
            aiMode: true,
          },
        });
      }

      await ctx.tx.message.create({
        data: {
          id: customerMessageId,
          conversationId,
          direction: 'inbound',
          text: input.message,
          provenance: 'customer',
          payload:
            itemContext || input.url
              ? ({ subject: itemContext, url: input.url } as unknown as object)
              : undefined,
        },
      });

      // The boundary guard (pack doc 06/12): injection/instruction-override detection + a
      // second, independent redaction pass over the context + the input-length ceiling. A
      // flagged request is REFUSED — recorded, never sent to a provider (constraint 1: no
      // binding action ever comes from free text; "place my bid" etc. is caught here).
      const guard = guardAiRequest(
        'assistant',
        input.message,
        itemContext as unknown as Record<string, unknown> | undefined,
      );

      if (!guard.allowed) {
        await ctx.tx.aiRun.create({
          data: {
            id: aiRunId,
            taskType: 'assistant',
            model: this.ai.model,
            provider: this.ai.name,
            actorId: actor.id,
            subjectType: 'Conversation',
            subjectId: conversationId,
            prompt: input.message,
            output: {
              blocked: true,
              refusalReason: guard.refusalReason,
              reasons: guard.injection.reasons,
              modelTier: guard.tier,
            } as unknown as object,
            confidence: 0,
          },
        });
        await ctx.tx.message.create({
          data: {
            id: newId(),
            conversationId,
            direction: 'outbound',
            text: SAFE_REFUSAL,
            provenance: 'ai',
            payload: { refused: true, refusalReason: guard.refusalReason } as unknown as object,
          },
        });
        ctx.audit({ action: 'AI_ASSISTANT_BLOCKED', targetType: 'AiRun', targetId: aiRunId });
        return { conversationId, reply: SAFE_REFUSAL, refused: true };
      }

      // Only the redacted, safe context reaches the provider — never the raw ItemContext.
      const assist = await this.ai.assist(input.message, guard.safeContext);
      const suggestions = suggestionsForSaleMethod(itemContext?.saleMethod);

      await ctx.tx.aiRun.create({
        data: {
          id: aiRunId,
          taskType: 'assistant',
          model: this.ai.model,
          provider: this.ai.name,
          actorId: actor.id,
          subjectType: 'Conversation',
          subjectId: conversationId,
          prompt: input.message,
          output: {
            reply: assist.reply,
            confidence: assist.confidence,
            modelTier: guard.tier,
            redactedKeys: guard.redactedKeys,
            suggestions,
          } as unknown as object,
          confidence: assist.confidence,
        },
      });
      await ctx.tx.message.create({
        data: {
          id: newId(),
          conversationId,
          direction: 'outbound',
          text: assist.reply,
          provenance: 'ai',
          payload: suggestions.length > 0 ? ({ suggestions } as unknown as object) : undefined,
        },
      });
      ctx.audit({ action: 'AI_ASSISTANT_REPLIED', targetType: 'AiRun', targetId: aiRunId });

      return { conversationId, reply: assist.reply, refused: false, suggestions };
    });
  }

  /** Own conversation + messages, ownership-scoped, customer-safe projection. */
  async getConversation(principal: Principal, conversationId: string) {
    this.requireFeature();
    const customerId = this.requireCustomerId(principal);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation || conversation.customerId !== customerId || conversation.channel !== 'web') {
      throw new NotFoundException('Conversation not found');
    }

    return {
      id: conversation.id,
      status: conversation.status,
      aiMode: conversation.aiMode,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      // Customer-safe projection: id/direction/provenance/text/payload/createdAt only — never
      // `sender` or `providerMessageId` (internal/staff-channel plumbing), matching the existing
      // safe shape ConnectService.conversation() already returns to staff.
      messages: conversation.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        provenance: m.provenance,
        text: m.text,
        payload: m.payload as unknown as ItemContextPayload | null,
        createdAt: m.createdAt,
      })),
    };
  }
}

/** The only shapes AssistantService ever writes to Message.payload (self-assembled, safe). */
interface ItemContextPayload {
  subject?: ItemContext;
  url?: string;
  suggestions?: string[];
  refused?: boolean;
  refusalReason?: string | null;
}
