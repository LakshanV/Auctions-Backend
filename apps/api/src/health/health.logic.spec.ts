import { describe, expect, it } from 'vitest';
import { liveness, readiness } from './health.logic';

describe('health logic', () => {
  it('reports liveness ok with a timestamp', () => {
    const result = liveness('api', new Date('2026-01-01T00:00:00.000Z'));
    expect(result.status).toBe('ok');
    expect(result.ts).toBe('2026-01-01T00:00:00.000Z');
  });

  it('is ready only when every dependency is healthy', () => {
    expect(readiness({ database: true }).status).toBe('ok');
    const degraded = readiness({ database: false });
    expect(degraded.status).toBe('degraded');
    expect(degraded.checks.database).toBe('fail');
  });
});
