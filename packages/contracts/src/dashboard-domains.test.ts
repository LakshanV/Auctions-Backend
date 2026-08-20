import { describe, expect, it } from 'vitest';
import { dashboardQuerySchema } from './dashboard-domains';

describe('dashboardQuerySchema', () => {
  it('defaults to the personal context', () => {
    expect(dashboardQuerySchema.parse({})).toEqual({ context: 'personal' });
  });

  it('requires an explicit organizationId for an organization context', () => {
    const result = dashboardQuerySchema.safeParse({ context: 'organization' });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.message).toContain(
      'organizationId is required',
    );
  });

  it('accepts an organization context with an id', () => {
    expect(
      dashboardQuerySchema.parse({ context: 'organization', organizationId: 'org_1' }),
    ).toEqual({ context: 'organization', organizationId: 'org_1' });
  });

  it('rejects an organizationId smuggled into a personal request', () => {
    const result = dashboardQuerySchema.safeParse({ context: 'personal', organizationId: 'org_1' });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.message).toContain('not permitted');
  });

  it('rejects an unknown context kind', () => {
    expect(dashboardQuerySchema.safeParse({ context: 'everything' }).success).toBe(false);
  });
});
