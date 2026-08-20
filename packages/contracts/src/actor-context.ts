import { z } from 'zod';

/**
 * Explicit personal-vs-organization acting context (pack doc 11 §Singha ID "company roles";
 * DECISIONS D-0055).
 *
 * A member may act for themselves OR for one organization they belong to, and the two are separate
 * books of record. Which book a request touches is an **explicit request parameter**, never
 * inferred from "the organization the caller happens to belong to" — inferring it would silently
 * widen every read and re-attribute every write the moment someone is added to an organization.
 *
 * The shape rules are defined once here and reused by every context-aware contract, so the Cockpit
 * and procurement can never drift apart on how a context is expressed:
 *  - `context` defaults to `personal`, which can NEVER produce an organization attribution;
 *  - `context: 'organization'` REQUIRES `organizationId`;
 *  - `context: 'personal'` REJECTS `organizationId`, so a request is never ambiguous.
 *
 * Authorization for the named organization is always enforced server-side (real membership, or an
 * explicit `organization:manage` grant) — the schema only guarantees the request is unambiguous.
 */

export const actorContextKinds = ['personal', 'organization'] as const;
export type ActorContextKind = (typeof actorContextKinds)[number];

/** The two fields that express an acting context; spread into any object schema. */
export const actorContextShape = {
  context: z.enum(actorContextKinds).default('personal'),
  organizationId: z.string().min(1).optional(),
};

/**
 * The cross-field rule tying `context` and `organizationId` together. Typed on `unknown` so it can
 * be attached to any object schema extended with {@link actorContextShape} — zod cannot infer the
 * merged output shape of a generic `z.ZodRawShape` well enough to type this parameter precisely.
 */
export function refineActorContext(value: unknown, ctx: z.RefinementCtx): void {
  const parsed = value as { context?: ActorContextKind; organizationId?: string };
  if (parsed.context === 'organization' && !parsed.organizationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['organizationId'],
      message: 'organizationId is required when context is "organization"',
    });
  }
  if (parsed.context === 'personal' && parsed.organizationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['organizationId'],
      message: 'organizationId is not permitted when context is "personal"',
    });
  }
}

/** An object schema extended with the explicit acting context and its cross-field rule. */
export function withActorContext<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, ...actorContextShape }).superRefine(refineActorContext);
}

/** A bare acting-context request (query params on a read route). */
export const actorContextSchema = withActorContext({});
export type ActorContextRequest = z.infer<typeof actorContextSchema>;
