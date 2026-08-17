import { z } from 'zod';
import { CATEGORY_KEYS } from './categories';

/**
 * RW2 — Photo-first AI seller intake (docs/10 "Customer AI"; OSS decisions in
 * SINGHA_OSS_DECISIONS.md). A seller photographs an item; a provider-neutral vision layer proposes
 * a listing draft. Every AI-derived field is ADVISORY and carries full provenance — value +
 * confidence + evidence + model/provider/version + timestamp + a confirmation state — so a human
 * accepts/edits/rejects each field. Vision output is a DERIVED record (an AiRun); it NEVER
 * overwrites the asset's facts (non-negotiable rule 3).
 */

/** One uploaded photo reference. A backend-issued media storageKey is preferred; a signed URL is
 *  allowed for a pre-persist preview. `view` is an optional hint of what the photo shows. */
export const visionImageRefSchema = z
  .object({
    storageKey: z.string().min(1).max(300).optional(),
    url: z.string().url().max(500).optional(),
    view: z.string().max(40).optional(),
  })
  .refine((i) => Boolean(i.storageKey) || Boolean(i.url), {
    message: 'each image needs a storageKey or url',
  });
export type VisionImageRef = z.infer<typeof visionImageRefSchema>;

export const visionIntakeSchema = z.object({
  /** Optional category hint; the provider may still suggest a different one with its own confidence. */
  category: z.enum(CATEGORY_KEYS).optional(),
  images: z.array(visionImageRefSchema).min(1).max(20),
  /** Optional seller-supplied structured hints (make/model/…): treated as evidence, never as fact. */
  attributes: z.record(z.unknown()).optional(),
  notes: z.string().max(2000).optional(),
  locale: z.string().max(10).optional(),
});
export type VisionIntakeInput = z.infer<typeof visionIntakeSchema>;

/**
 * Confirmation/observation state for a suggested field (directive §13). Uncertainty is never
 * hidden: a field the photos could not establish is `not_visible`, not a confident guess.
 */
export const VISION_FIELD_STATES = [
  'observed',
  'probable',
  'uncertain',
  'not_visible',
  'user_confirmed',
  'staff_confirmed',
  'contradicted',
] as const;
export type VisionFieldState = (typeof VISION_FIELD_STATES)[number];

export interface VisionFieldSuggestion {
  field: string;
  value: string | number | boolean | null;
  confidence: number; // 0..1
  source: string; // short human-readable evidence/reason
  state: VisionFieldState;
}

export interface CaptureRequirement {
  view: string;
  label: string;
  required: boolean;
  present: boolean;
  guidance?: string;
}

export interface CaptureIssue {
  kind:
    'blur' | 'dark' | 'glare' | 'subject_small' | 'duplicate' | 'wrong_subject' | 'unreadable_id';
  imageRef?: string;
  message: string;
}

/** Evidence-based valuation guidance — NEVER an LLM-invented number (directive §14). Snapshotted. */
export interface VisionValuation {
  currency: string;
  lowMinor: number;
  expectedMinor: number;
  highMinor: number;
  confidence: number;
  comparableRefs: string[];
  factors: string[];
  assessedAt: string; // ISO
}

export interface VisionIntakeResult {
  runId: string;
  category?: { value: string; confidence: number; source: string };
  fields: VisionFieldSuggestion[];
  capture: CaptureRequirement[];
  issues: CaptureIssue[];
  valuation?: VisionValuation;
  /** Always true — a vision draft is advisory and never an authoritative fact or a binding action. */
  advisory: true;
  model: string;
  provider: string;
  version: string;
  createdAt: string;
}
