import { describe, expect, it } from 'vitest';
import { loadConfig, pendingBusinessApprovals } from './index';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('config', () => {
  it('applies safe product defaults (docs/20)', () => {
    const cfg = loadConfig(base);
    expect(cfg.nodeEnv).toBe('development');
    expect(cfg.features.timedAuctions).toBe(true);
    expect(cfg.features.eoi).toBe(true);
    expect(cfg.features.cubeCatalogue).toBe(true);
    // Higher-risk sale modes are off by default.
    expect(cfg.features.buyNow).toBe(false);
    expect(cfg.features.liveAuctions).toBe(false);
    expect(cfg.locale.defaultCurrency).toBe('LKR');
  });

  it('treats an empty REDIS_URL as "disabled" rather than failing', () => {
    const cfg = loadConfig({ ...base, REDIS_URL: '' });
    expect(cfg.redis.enabled).toBe(false);
  });

  it('coerces feature-flag strings and detects unconfigured providers', () => {
    const cfg = loadConfig({
      ...base,
      FEATURE_BUY_NOW: 'true',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(cfg.features.buyNow).toBe(true);
    expect(cfg.redis.enabled).toBe(true);
    expect(cfg.providers.payment.configured).toBe(false);
    expect(cfg.providers.storage.configured).toBe(false);
  });

  it('flags business values that still need product-owner approval', () => {
    const cfg = loadConfig(base);
    expect(pendingBusinessApprovals(cfg)).toContain('buyerPremiumPct');
  });

  it('throws a readable error when DATABASE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
