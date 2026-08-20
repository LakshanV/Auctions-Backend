import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { actorContextSchema, withActorContext } from './actor-context';
import { dashboardQuerySchema } from './dashboard-domains';
import {
  createProcurementRequestSchema,
  procurementRequestsQuerySchema,
} from './procurement-domains';

const firstMessage = (result: z.SafeParseReturnType<unknown, unknown>) =>
  result.success === false ? (result.error.issues[0]?.message ?? '') : '';

/** Every context-aware contract must obey the same rules — run one table over all of them. */
const contextual: { name: string; schema: z.ZodTypeAny; base: Record<string, unknown> }[] = [
  { name: 'actorContextSchema', schema: actorContextSchema, base: {} },
  { name: 'dashboardQuerySchema', schema: dashboardQuerySchema, base: {} },
  { name: 'procurementRequestsQuerySchema', schema: procurementRequestsQuerySchema, base: {} },
  {
    name: 'createProcurementRequestSchema',
    schema: createProcurementRequestSchema,
    base: { type: 'RFQ', title: 'Need 10t steel', currency: 'USD' },
  },
];

describe.each(contextual)('$name acting context', ({ schema, base }) => {
  it('defaults to the personal context', () => {
    const parsed = schema.parse({ ...base }) as { context: string; organizationId?: string };
    expect(parsed.context).toBe('personal');
    expect(parsed.organizationId).toBeUndefined();
  });

  it('requires an explicit organizationId for an organization context', () => {
    const result = schema.safeParse({ ...base, context: 'organization' });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toContain('organizationId is required');
  });

  it('accepts an organization context with an id', () => {
    const parsed = schema.parse({
      ...base,
      context: 'organization',
      organizationId: 'org_1',
    }) as { context: string; organizationId?: string };
    expect(parsed).toMatchObject({ context: 'organization', organizationId: 'org_1' });
  });

  it('rejects an organizationId smuggled into a personal request', () => {
    const result = schema.safeParse({ ...base, context: 'personal', organizationId: 'org_1' });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toContain('not permitted');
  });

  it('rejects an unknown context kind', () => {
    expect(schema.safeParse({ ...base, context: 'everything' }).success).toBe(false);
  });

  it('rejects an empty organizationId', () => {
    expect(schema.safeParse({ ...base, context: 'organization', organizationId: '' }).success).toBe(
      false,
    );
  });
});

describe('withActorContext', () => {
  it('keeps the wrapped shape and its own validation intact', () => {
    const schema = withActorContext({ title: z.string().min(3) });
    expect(schema.safeParse({ title: 'ok' }).success).toBe(false);
    expect(schema.parse({ title: 'good title' })).toEqual({
      title: 'good title',
      context: 'personal',
    });
  });
});

describe('createProcurementRequestSchema', () => {
  it('still validates the procurement payload alongside the context', () => {
    const result = createProcurementRequestSchema.safeParse({
      type: 'NOT_A_TYPE',
      title: 'x',
      currency: 'USD',
      context: 'organization',
      organizationId: 'org_1',
    });
    expect(result.success).toBe(false);
  });
});
