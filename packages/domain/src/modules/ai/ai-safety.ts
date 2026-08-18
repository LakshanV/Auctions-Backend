/**
 * Singha AI Core — safety + routing kernel (pack doc 06/10). PURE, deterministic, and
 * Tier-A: prompt templates/policy, the model-tier router and the injection heuristics live
 * here on the server and NEVER reach the browser bundle. Two jobs:
 *
 *   1. Guard the boundary — detect prompt-injection / instruction-override attempts in
 *      free text and redact sensitive context keys before anything reaches a provider.
 *   2. Route the task — pick the cheapest capable model tier per task, per the cost
 *      policy (pack doc 02): classification/extraction/translation/drafting → cheap;
 *      open-ended assistance/synthesis → strong.
 *
 * AI output is always a DERIVED record (rule 3); nothing here can place a bid or mutate a
 * fact — free text may at most create a bid INTENT elsewhere, never a binding action.
 */

export type AiTaskType =
  'listing_draft' | 'assistant' | 'translation' | 'classification' | 'extraction' | 'synthesis';

export type ModelTier = 'cheap' | 'strong';

/** Cheapest capable tier for a task (pack doc 02 cost routing). */
export function routeModelTier(task: AiTaskType): ModelTier {
  switch (task) {
    case 'assistant':
    case 'synthesis':
      return 'strong'; // ambiguous reasoning / policy-safe synthesis
    default:
      return 'cheap'; // classification / extraction / translation / drafting
  }
}

/** Server-only prompt/policy descriptor. The template body stays private (never serialised). */
export interface PromptPolicy {
  task: AiTaskType;
  tier: ModelTier;
  /** Hard input ceiling — oversized free text is a common injection/DoS vector. */
  maxInputChars: number;
  /** Whether the task accepts free-form user text at all (vs. structured fields only). */
  allowsFreeText: boolean;
}

const POLICIES: Record<AiTaskType, PromptPolicy> = {
  listing_draft: {
    task: 'listing_draft',
    tier: 'cheap',
    maxInputChars: 4000,
    allowsFreeText: false,
  },
  assistant: { task: 'assistant', tier: 'strong', maxInputChars: 2000, allowsFreeText: true },
  translation: { task: 'translation', tier: 'cheap', maxInputChars: 6000, allowsFreeText: true },
  classification: {
    task: 'classification',
    tier: 'cheap',
    maxInputChars: 2000,
    allowsFreeText: true,
  },
  extraction: { task: 'extraction', tier: 'cheap', maxInputChars: 6000, allowsFreeText: true },
  synthesis: { task: 'synthesis', tier: 'strong', maxInputChars: 4000, allowsFreeText: true },
};

export function getPromptPolicy(task: AiTaskType): PromptPolicy {
  return POLICIES[task];
}

// Instruction-override / exfiltration / role-hijack heuristics. Deliberately conservative
// (high-precision) — these are signals to REFUSE + audit, not a claim of perfect defense.
const INJECTION_PATTERNS: { re: RegExp; reason: string }[] = [
  {
    re: /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts|rules)/i,
    reason: 'instruction_override',
  },
  { re: /disregard (the )?(system|previous|above)/i, reason: 'instruction_override' },
  {
    re: /you are now|pretend to be|act as (an? )?(?:dan|admin|system|developer)/i,
    reason: 'role_hijack',
  },
  {
    re: /(reveal|show|print|repeat|leak) (me )?(your |the )?(system prompt|instructions|prompt|hidden|policy)/i,
    reason: 'prompt_exfiltration',
  },
  {
    re: /(proxy ?max|maximum bid|reserve price|other bidders?'? (max|identity))/i,
    reason: 'tier_a_probe',
  },
  {
    re: /\b(place|submit|confirm|accept) (a |my )?(binding )?bid\b/i,
    reason: 'binding_action_via_freetext',
  },
  { re: /<\/?(system|assistant|tool)>|\[\/?INST\]|```system/i, reason: 'role_markup_injection' },
];

export interface InjectionVerdict {
  flagged: boolean;
  reasons: string[];
}

/** Detect likely prompt-injection / boundary-violation attempts in free text. */
export function detectPromptInjection(text: string): InjectionVerdict {
  const reasons = new Set<string>();
  for (const { re, reason } of INJECTION_PATTERNS) if (re.test(text)) reasons.add(reason);
  return { flagged: reasons.size > 0, reasons: [...reasons].sort() };
}

// Context keys that must NEVER cross the boundary into a provider prompt (data boundary).
const FORBIDDEN_KEY =
  /(token|secret|password|api[_-]?key|proxy|max|reserve|credit|exposure|score|weight|internal|ssn|card)/i;

/**
 * Redact sensitive keys from a context object before it reaches a provider (pack doc 12
 * "no proxy-max / credit / internal fields cross the boundary"). Returns the safe object
 * plus the list of keys that were dropped (for the audit trail).
 */
/** Deep-redact: drop any forbidden key at ANY depth (nested objects and arrays included). */
function redactValue(value: unknown, redactedKeys: string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => redactValue(v, redactedKeys));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(k)) {
        redactedKeys.push(k);
        continue;
      }
      out[k] = redactValue(v, redactedKeys);
    }
    return out;
  }
  return value;
}

export function redactContext(context: Record<string, unknown> | undefined): {
  safe: Record<string, unknown>;
  redactedKeys: string[];
} {
  // Recurse so a sensitive key nested inside a sub-object or array is dropped too — a shallow
  // top-level-only pass let e.g. `{ subject: { proxyMax } }` reach the provider. Keys are
  // de-duplicated across depths for a stable audit list.
  const redactedKeys: string[] = [];
  const safe = redactValue(context ?? {}, redactedKeys) as Record<string, unknown>;
  return { safe, redactedKeys: [...new Set(redactedKeys)].sort() };
}

export interface AiGuardResult {
  allowed: boolean;
  tier: ModelTier;
  injection: InjectionVerdict;
  safeContext: Record<string, unknown>;
  redactedKeys: string[];
  refusalReason: string | null;
}

/**
 * The single boundary guard the AI service calls before invoking a provider: enforce the
 * input ceiling, detect injection, redact context and resolve the model tier. When it
 * refuses (`allowed:false`), the caller records a blocked AiRun and returns a safe message
 * instead of calling the model.
 */
export function guardAiRequest(
  task: AiTaskType,
  text: string,
  context?: Record<string, unknown>,
): AiGuardResult {
  const policy = getPromptPolicy(task);
  const injection = detectPromptInjection(text);
  const { safe, redactedKeys } = redactContext(context);
  const overLength = text.length > policy.maxInputChars;
  // Enforce the declared policy: a structured-only task (allowsFreeText:false) must REFUSE any
  // non-empty free text rather than silently forwarding it. Previously this flag was declared
  // but never checked, so the guarantee was inert.
  const freeTextNotAllowed = !policy.allowsFreeText && text.trim().length > 0;
  const allowed = !injection.flagged && !overLength && !freeTextNotAllowed;
  return {
    allowed,
    tier: policy.tier,
    injection,
    safeContext: safe,
    redactedKeys,
    refusalReason: injection.flagged
      ? 'prompt_injection'
      : overLength
        ? 'input_too_long'
        : freeTextNotAllowed
          ? 'free_text_not_allowed'
          : null,
  };
}
