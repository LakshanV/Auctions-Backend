import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AiFeedbackInput,
  type ApplyDraftInput,
  type AssistInput,
  DomainEventName,
  type DraftListingInput,
  type TranslateInput,
  newId,
} from '@singha/contracts';
import {
  type AiFeedbackRecord,
  guardAiRequest,
  redactContext,
  summarizeAiEvaluation,
} from '@singha/domain';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { AI_PROVIDER, type AiProvider, type ListingDraft } from './ai.provider';

const SAFE_REFUSAL =
  'I can’t help with that request. A Singha specialist can assist you with anything about a lot, bidding or your account.';

/**
 * Singha AI Core (docs/10). Every AI invocation is recorded as an AiRun with
 * provenance (governance). AI output is a DERIVED record (rule 3) — it NEVER
 * overwrites the asset's facts. Applying a draft to a listing is a separate,
 * explicit, authorised human action. AI cannot bypass the deterministic domains.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async draftListing(principal: Principal, input: DraftListingInput) {
    // Resolve the facts from a persisted asset OR from the seller's in-progress inputs (§11). The
    // asset (when present) is read-only here — the draft never writes over its facts (rule 3).
    let category: string;
    let attributes: Record<string, unknown>;
    if (input.assetId) {
      const asset = await this.prisma.asset.findUnique({ where: { id: input.assetId } });
      if (!asset) throw new NotFoundException('Asset not found');
      category = asset.category;
      attributes = (asset.attributes as Record<string, unknown>) ?? {};
    } else {
      category = input.category!;
      attributes = { ...(input.attributes ?? {}) };
    }
    // Free-text notes pass through the SAME injection guard as other free text (rule 3/12); a
    // flagged note is dropped, never sent to the provider. Clean notes enrich the draft context.
    if (input.notes) {
      const guard = guardAiRequest('assistant', input.notes);
      if (guard.allowed) attributes = { ...attributes, notes: input.notes };
    }

    // Redact sensitive keys (reserve / proxy-max / internal / credit / …) from the attributes
    // before they cross into the provider — the SAME data boundary assist()/vision enforce
    // (rule 3, pack doc 12). A listing draft is derived from PUBLIC facts; Tier-A values must
    // never reach a model. This was the one provider call that skipped redaction.
    const { safe: safeAttributes, redactedKeys } = redactContext(attributes);
    const draft = await this.ai.draftListing(category, safeAttributes, input.locale);
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.aiRun.create({
        data: {
          id,
          taskType: 'listing_draft',
          model: this.ai.model,
          provider: this.ai.name,
          actorId: actor.id,
          ...(input.assetId ? { subjectType: 'Asset', subjectId: input.assetId } : {}),
          output: draft as unknown as object,
          confidence: draft.confidence,
        },
      });
      // provenance = 'ai' (a distinct, auditable actor). NB: the asset is NOT touched.
      ctx.emit({
        name: DomainEventName.AiRunRecorded,
        aggregateType: 'AiRun',
        aggregateId: id,
        payload: { aiRunId: id, taskType: 'listing_draft', subjectId: input.assetId ?? null },
      });
      ctx.audit({
        action: 'AI_LISTING_DRAFTED',
        targetType: 'Asset',
        targetId: input.assetId ?? 'draft',
        actorType: 'ai',
        after: { redactedKeys },
      });
      return { aiRunId: id, provider: this.ai.name, model: this.ai.model, draft, redactedKeys };
    });
  }

  async assist(principal: Principal, input: AssistInput) {
    const actor = toActor(principal);
    const id = newId();

    // Boundary guard (pack doc 06/12): detect prompt-injection, redact sensitive context,
    // resolve the model tier. A flagged request is REFUSED — recorded, never sent to a
    // provider — so free text can never override policy or exfiltrate Tier-A data.
    const guard = guardAiRequest('assistant', input.prompt, input.context);
    if (!guard.allowed) {
      return this.uow.execute(actor, async (ctx) => {
        await ctx.tx.aiRun.create({
          data: {
            id,
            taskType: 'assistant',
            model: this.ai.model,
            provider: this.ai.name,
            actorId: actor.id,
            prompt: input.prompt,
            output: {
              blocked: true,
              refusalReason: guard.refusalReason,
              reasons: guard.injection.reasons,
              modelTier: guard.tier,
            } as unknown as object,
            confidence: 0,
          },
        });
        ctx.audit({
          action: 'AI_ASSIST_BLOCKED',
          targetType: 'AiRun',
          targetId: id,
          actorType: 'ai',
        });
        return {
          aiRunId: id,
          reply: SAFE_REFUSAL,
          confidence: 0,
          blocked: true,
          refusalReason: guard.refusalReason,
        };
      });
    }

    // Only the redacted, safe context crosses into the provider.
    const reply = await this.ai.assist(input.prompt, guard.safeContext);
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.aiRun.create({
        data: {
          id,
          taskType: 'assistant',
          model: this.ai.model,
          provider: this.ai.name,
          actorId: actor.id,
          prompt: input.prompt,
          output: {
            ...reply,
            modelTier: guard.tier,
            redactedKeys: guard.redactedKeys,
          } as unknown as object,
          confidence: reply.confidence,
        },
      });
      ctx.audit({ action: 'AI_ASSIST', targetType: 'AiRun', targetId: id, actorType: 'ai' });
      return { aiRunId: id, ...reply, blocked: false };
    });
  }

  /**
   * Translate free text (docs/10 Customer AI — multilingual assistant). Same
   * boundary-guard shape as `assist()`: `text` is free text, so it goes THROUGH
   * `guardAiRequest('translation', ...)` for injection detection before anything
   * reaches a provider. There is no free-form `context` bag on this DTO (nothing
   * to redact), but the ceiling/injection checks still fully apply to `text`. The
   * translation itself is a DERIVED record (rule 3) — the source text is never
   * touched, only ever passed through as-is to the provider once cleared.
   */
  async translate(principal: Principal, input: TranslateInput) {
    const actor = toActor(principal);
    const id = newId();

    const guard = guardAiRequest('translation', input.text);
    if (!guard.allowed) {
      return this.uow.execute(actor, async (ctx) => {
        await ctx.tx.aiRun.create({
          data: {
            id,
            taskType: 'translation',
            model: this.ai.model,
            provider: this.ai.name,
            actorId: actor.id,
            prompt: input.text,
            output: {
              blocked: true,
              refusalReason: guard.refusalReason,
              reasons: guard.injection.reasons,
              modelTier: guard.tier,
            } as unknown as object,
            confidence: 0,
          },
        });
        ctx.audit({
          action: 'AI_TRANSLATE_BLOCKED',
          targetType: 'AiRun',
          targetId: id,
          actorType: 'ai',
        });
        return {
          aiRunId: id,
          translatedText: SAFE_REFUSAL,
          confidence: 0,
          blocked: true,
          refusalReason: guard.refusalReason,
        };
      });
    }

    // Only text that has cleared the guard reaches the provider.
    const result = await this.ai.translate(input.text, input.targetLang, input.sourceLang);
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.aiRun.create({
        data: {
          id,
          taskType: 'translation',
          model: this.ai.model,
          provider: this.ai.name,
          actorId: actor.id,
          prompt: input.text,
          output: {
            ...result,
            targetLang: input.targetLang,
            sourceLang: input.sourceLang ?? null,
            modelTier: guard.tier,
          } as unknown as object,
          confidence: result.confidence,
        },
      });
      ctx.audit({ action: 'AI_TRANSLATE', targetType: 'AiRun', targetId: id, actorType: 'ai' });
      return { aiRunId: id, ...result, blocked: false };
    });
  }

  async getRun(id: string) {
    const run = await this.prisma.aiRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('AI run not found');
    return {
      id: run.id,
      taskType: run.taskType,
      provider: run.provider,
      model: run.model,
      subjectType: run.subjectType,
      subjectId: run.subjectId,
      output: run.output,
      confidence: run.confidence,
      applied: run.applied,
      createdAt: run.createdAt,
    };
  }

  /**
   * Explicitly APPLY a listing draft (human-authorised). Only now does derived AI
   * content become a real listing fact — via the normal listing field, recorded
   * as a human action referencing the AiRun.
   */
  async applyDraft(principal: Principal, aiRunId: string, input: ApplyDraftInput) {
    const run = await this.prisma.aiRun.findUnique({ where: { id: aiRunId } });
    if (!run) throw new NotFoundException('AI run not found');
    if (run.taskType !== 'listing_draft') throw new ConflictException('Not a listing draft');
    if (run.applied) throw new ConflictException('Draft already applied');
    const listing = await this.prisma.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new NotFoundException('Listing not found');

    const draft = run.output as unknown as ListingDraft;
    const actor = toActor(principal);
    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.listing.update({
        where: { id: input.listingId },
        data: { title: draft.title },
      });
      await ctx.tx.aiRun.update({
        where: { id: aiRunId },
        data: { applied: true, appliedBy: principal.customerId ?? 'staff' },
      });
      ctx.emit({
        name: DomainEventName.AiDraftApplied,
        aggregateType: 'Listing',
        aggregateId: input.listingId,
        payload: { listingId: input.listingId, aiRunId },
      });
      // The APPLY is a human action (actor = the staff principal), not the AI.
      ctx.audit({
        action: 'AI_DRAFT_APPLIED',
        targetType: 'Listing',
        targetId: input.listingId,
        after: { title: updated.title, fromAiRun: aiRunId },
      });
      return { listingId: input.listingId, title: updated.title, appliedFrom: aiRunId };
    });
  }

  /**
   * §8 — record a human's verdict on an AI run (accepted / corrected / rejected). Append-only: the
   * AI output is never mutated (rule 3), each correction is a new immutable record (rule 5). This is
   * the correction half of the loop; `evaluation()` aggregates the accumulated feedback.
   */
  async recordFeedback(principal: Principal, aiRunId: string, input: AiFeedbackInput) {
    const run = await this.prisma.aiRun.findUnique({ where: { id: aiRunId } });
    if (!run) throw new NotFoundException('AI run not found');
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.aiFeedback.create({
        data: {
          id,
          aiRunId,
          outcome: input.outcome,
          // Omit the Json column entirely when there are no corrections (a nullable Prisma Json
          // rejects a bare JS `null`); a provided map is stored as-is.
          ...(input.correctedFields ? { correctedFields: input.correctedFields as object } : {}),
          note: input.note,
          actorId: actor.id,
        },
      });
      // The feedback is a HUMAN action (actor = the principal), not the AI.
      ctx.audit({
        action: 'AI_FEEDBACK_RECORDED',
        targetType: 'AiRun',
        targetId: aiRunId,
        after: { outcome: input.outcome },
      });
      return { id, aiRunId, outcome: input.outcome };
    });
  }

  /**
   * §8 — the evaluation half of the loop: aggregate all human feedback into deterministic accuracy
   * metrics (overall + per task type). Advisory, read-only. Joins each feedback to its run's task
   * type so acceptance/correction/rejection can be read per AI capability.
   */
  async evaluation() {
    const feedback = await this.prisma.aiFeedback.findMany({
      include: { aiRun: { select: { taskType: true } } },
    });
    const records: AiFeedbackRecord[] = feedback.map((f) => ({
      outcome: f.outcome as AiFeedbackRecord['outcome'],
      taskType: f.aiRun.taskType,
      correctedFieldCount:
        f.correctedFields && typeof f.correctedFields === 'object'
          ? Object.keys(f.correctedFields as Record<string, unknown>).length
          : 0,
    }));
    return summarizeAiEvaluation(records);
  }
}
