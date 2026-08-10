import { describe, expect, it } from 'vitest';
import { anEvent, withEnv } from './index';

describe('test-utils', () => {
  it('builds a valid default envelope', () => {
    const event = anEvent({ payload: { amount: 100 } });
    expect(event.name).toBe('BID_ACCEPTED');
    expect(event.payload).toEqual({ amount: 100 });
  });

  it('sets and restores env vars around a block', async () => {
    const key = 'SINGHA_TEST_ONLY_VAR';
    expect(process.env[key]).toBeUndefined();
    const seen = await withEnv({ [key]: 'x' }, () => process.env[key]);
    expect(seen).toBe('x');
    expect(process.env[key]).toBeUndefined();
  });
});
