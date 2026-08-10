import { describe, expect, it } from 'vitest';
import { loadConfig } from '@singha/config';
import { featureFlagsView } from './feature-flags.logic';

describe('feature flags view', () => {
  it('exposes the active flags and pending business approvals', () => {
    const config = loadConfig({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    const view = featureFlagsView(config);

    expect(view.apiVersion).toBe('v1');
    expect(view.features.timedAuctions).toBe(true);
    expect(view.features.buyNow).toBe(false);
    expect(view.providers.payment.configured).toBe(false);
    expect(view.pendingBusinessApprovals).toContain('buyerPremiumPct');
  });
});
