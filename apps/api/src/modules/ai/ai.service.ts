import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ApplyDraftInput,
  type AssistInput,
  DomainEventName,
  type DraftListingInput,
  newId,
} from '@singha/contracts';
import { guardAiRequest } from '@singha/domain';
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
    const asset = await this.prisma.asset.findUnique({ where: { id: input.assetId } });
    if (!asset) throw new NotFoundException('Asset not found');

    const draft = await this.ai.draftListing(
      asset.category,
      (asset.attributes as Record<string, unknown>) ?? {},
      input.locale,
    );
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
          subjectType: 'Asset',
          subjectId: input.assetId,
          output: draft as unknown as object,
          confidence: draft.confidence,
        },
      });
      // provenance = 'ai' (a distinct, auditable actor). NB: the asset is NOT touched.
      ctx.emit({
        name: DomainEventName.AiRunRecorded,
        aggregateType: 'AiRun',
        aggregateId: id,
        payload: { aiRunId: id, taskType: 'listing_draft', subjectId: input.assetId },
      });
      ctx.audit({
        action: 'AI_LISTING_DRAFTED',
        targetType: 'Asset',
        targetId: input.assetId,
        actorType: 'ai',
      });
      return { aiRunId: id, provider: this.ai.name, model: this.ai.model, draft };
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
}
