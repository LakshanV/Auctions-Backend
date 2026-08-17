import { Inject, Injectable } from '@nestjs/common';
import {
  type CategoryKey,
  DomainEventName,
  type VisionIntakeInput,
  type VisionIntakeResult,
  newId,
} from '@singha/contracts';
import {
  buildCaptureCoach,
  finalizeFields,
  guardAiRequest,
  hasUnmetRequiredCaptures,
  toVisionValuation,
} from '@singha/domain';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';
import { IntelligenceService } from '../intelligence/intelligence.service';
import { VISION_PROVIDER, type VisionIntelligenceProvider } from './vision.provider';

const SAFE_REFUSAL =
  'I can’t process those notes. You can still create the listing manually — a Singha specialist can help.';

/** Soft-refusal shape returned when the free-text notes trip the AI boundary guard (mirrors assist()). */
export interface VisionBlockedResult {
  runId: string;
  advisory: true;
  blocked: true;
  refusalReason: string;
  message: string;
}

/**
 * RW2 — Photo-first AI seller intake service (docs/10). Orchestrates the provider-neutral vision
 * port + the pure domain kernel + Singha comparables into an ADVISORY listing draft, and records
 * it as a governed {@link AiRun} with full provenance.
 *
 * Non-negotiables enforced here:
 *   - The result NEVER writes an asset/listing fact (rule 3) — it is a derived record only.
 *   - It is NEVER a binding action (rule 11); `advisory` is always true.
 *   - Free-text `notes` pass the SAME boundary guard as the rest of AI Core before any provider call.
 *   - Valuation is evidence-based from comparables, never an AI-invented number (directive §14).
 *   - AI degrades gracefully: if the provider is unavailable the seller lists manually.
 */
@Injectable()
export class VisionService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly intelligence: IntelligenceService,
    @Inject(VISION_PROVIDER) private readonly vision: VisionIntelligenceProvider,
  ) {}

  async intake(
    principal: Principal,
    input: VisionIntakeInput,
  ): Promise<VisionIntakeResult | VisionBlockedResult> {
    const actor = toActor(principal);
    const id = newId();

    // Boundary guard on the seller's free-text notes (same seam as assist/translate). Structured
    // attributes are passed as context so sensitive keys are redacted before any provider call.
    const guard = guardAiRequest('extraction', input.notes ?? '', input.attributes);
    if (!guard.allowed) {
      return this.uow.execute(actor, async (ctx) => {
        await ctx.tx.aiRun.create({
          data: {
            id,
            taskType: 'media_caption',
            model: this.vision.model,
            provider: this.vision.name,
            actorId: actor.id,
            prompt: input.notes ?? null,
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
          action: 'AI_VISION_BLOCKED',
          targetType: 'AiRun',
          targetId: id,
          actorType: 'ai',
        });
        return {
          runId: id,
          advisory: true as const,
          blocked: true as const,
          refusalReason: guard.refusalReason ?? 'blocked',
          message: SAFE_REFUSAL,
        };
      });
    }

    // The provider only REPORTS what the photos appear to show; it is never authoritative.
    const analysis = await this.vision.analyze({
      category: input.category,
      images: input.images,
      attributes: guard.safeContext,
      notes: input.notes,
      locale: input.locale,
    });

    const category: CategoryKey = input.category ?? analysis.categoryGuess?.value ?? 'general';
    const coach = buildCaptureCoach(category, analysis.coveredViews);
    const fields = finalizeFields(analysis.observations, input.attributes ?? {});
    const evidenceComplete = !hasUnmetRequiredCaptures(coach);

    // Evidence-based valuation from Singha comparables (never an LLM-invented figure).
    const comps = await this.intelligence.comparables(category, 10);
    const sr = comps.suggestedRange;
    const range =
      sr && sr.minMinor != null && sr.medianMinor != null && sr.maxMinor != null
        ? { minMinor: sr.minMinor, medianMinor: sr.medianMinor, maxMinor: sr.maxMinor }
        : null;
    const valuation = toVisionValuation({
      currency: comps.comparables[0]?.currency ?? 'LKR',
      range,
      comparableCount: comps.count,
      comparableRefs: comps.comparables.map((c) => c.publicRef),
      factors: [`category: ${category}`],
      evidenceComplete,
      assessedAt: new Date().toISOString(),
    });

    const result: VisionIntakeResult = {
      runId: id,
      category: analysis.categoryGuess
        ? {
            value: analysis.categoryGuess.value,
            confidence: analysis.categoryGuess.confidence,
            source: analysis.categoryGuess.source,
          }
        : input.category
          ? { value: input.category, confidence: 1, source: 'seller-selected' }
          : undefined,
      fields,
      capture: coach,
      issues: analysis.issues,
      valuation,
      advisory: true,
      model: this.vision.model,
      provider: this.vision.name,
      version: this.vision.version,
      createdAt: new Date().toISOString(),
    };

    // Governance: record the intake as a derived AiRun with provenance. The asset is NOT touched.
    return this.uow.execute(actor, async (ctx) => {
      await ctx.tx.aiRun.create({
        data: {
          id,
          taskType: 'media_caption',
          model: this.vision.model,
          provider: this.vision.name,
          actorId: actor.id,
          subjectType: 'VisionIntake',
          prompt: input.notes ?? null,
          output: { ...result, modelTier: guard.tier } as unknown as object,
          confidence: valuation?.confidence ?? analysis.categoryGuess?.confidence ?? null,
        },
      });
      ctx.emit({
        name: DomainEventName.AiRunRecorded,
        aggregateType: 'AiRun',
        aggregateId: id,
        payload: { aiRunId: id, taskType: 'media_caption', category },
      });
      ctx.audit({
        action: 'AI_VISION_INTAKE',
        targetType: 'AiRun',
        targetId: id,
        actorType: 'ai',
      });
      return result;
    });
  }
}
