import { interpretSearchQuery, type SearchInterpretation } from './ai.search-interpreter';

export type { SearchInterpretation };

/** A drafted listing (DERIVED content — never written over the asset's facts). */
export interface ListingDraft {
  title: string;
  description: string;
  highlights: string[];
  confidence: number;
}

export interface AssistReply {
  reply: string;
  confidence: number;
}

/** A translation (DERIVED content — never overwrites the source text). */
export interface TranslateReply {
  translatedText: string;
  detectedSourceLang?: string;
  confidence: number;
}

/**
 * AI provider adapter (docs/10 — provider abstraction). Real text/vision
 * providers implement this when their keys arrive; nothing else changes. Outputs
 * are always DERIVED records with provenance, never authoritative facts.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  draftListing(
    category: string,
    attributes: Record<string, unknown>,
    locale: string,
  ): Promise<ListingDraft>;
  assist(prompt: string, context?: Record<string, unknown>): Promise<AssistReply>;
  translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslateReply>;
  /**
   * AIC-3 — interpret a natural-language search query into STRUCTURED catalogue filters (the
   * "LLM interprets" seam, docs/10 "Customer AI" search/discovery). This is the model's ENTIRE
   * job: it NEVER sees inventory, NEVER ranks and NEVER returns a result — only a best-guess
   * filter object. The caller (`AssistantService.search`) re-validates every field against the
   * SAME `catalogueQuerySchema` the public catalogue itself enforces, and only
   * `CatalogueV2Service` — the one authoritative executor — ever queries the database.
   */
  interpretSearch(query: string): Promise<SearchInterpretation>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/**
 * Deterministic mock provider used until a real model is configured. It composes
 * a plausible draft from the asset's own attributes so the full create/apply flow
 * is exercised without any external call or cost.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'mock-1';

  async draftListing(
    category: string,
    attributes: Record<string, unknown>,
    _locale: string,
  ): Promise<ListingDraft> {
    const parts = Object.entries(attributes)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${String(v)}`);
    const headline = this.headline(category, attributes);
    return {
      title: headline,
      description: `${headline}. ${parts.join(', ')}. Presented by Singha Auctions.`,
      highlights: parts.slice(0, 5),
      confidence: 0.6,
    };
  }

  async assist(prompt: string, _context?: Record<string, unknown>): Promise<AssistReply> {
    return {
      reply: `Thanks for your question: "${prompt.slice(0, 120)}". A Singha specialist will confirm the details.`,
      confidence: 0.4,
    };
  }

  /** Deterministic, credential-free fake: mirrors `assist()` above — no external
   * call, so the create/guard/record flow is fully exercised without a real
   * model configured. Marks the text with the target locale rather than
   * attempting real translation. */
  async translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslateReply> {
    return {
      translatedText: `[${targetLang}] ${text}`,
      detectedSourceLang: sourceLang ?? 'auto',
      confidence: 0.5,
    };
  }

  /** Deterministic keyword->filter mapper (see `ai.search-interpreter.ts`) — no external call,
   * no randomness, so the guard/interpret/validate/execute flow is fully exercised without a
   * real model configured. Swapping in a real model later means replacing only this method. */
  async interpretSearch(query: string): Promise<SearchInterpretation> {
    return interpretSearchQuery(query);
  }

  private headline(category: string, a: Record<string, unknown>): string {
    if (category === 'vehicles' && a.make && a.model) {
      return `${a.year ?? ''} ${a.make} ${a.model}`.trim();
    }
    if (category === 'property' && a.propertyType) {
      return `${a.propertyType} property${a.district ? ` in ${a.district}` : ''}`;
    }
    if (category === 'gems' && a.type) return `${a.caratWeight ?? ''}ct ${a.type}`.trim();
    return `${category} lot`;
  }
}
