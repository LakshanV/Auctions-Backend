import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';
import { createMetricsRegistry } from './metrics';
import { getCorrelationId, newCorrelationId, runWithCorrelation } from './correlation';

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { lines, stream };
}

describe('logger', () => {
  it('redacts secrets from structured output', () => {
    const { lines, stream } = captureLogs();
    const log = createLogger({ name: 'test', level: 'info' }, stream);
    log.info({ authorization: 'Bearer super-secret', token: 'abc', ok: 'visible' }, 'hello');

    const record = JSON.parse(lines[0] ?? '{}');
    expect(record.authorization).toBe('[redacted]');
    expect(record.token).toBe('[redacted]');
    expect(record.ok).toBe('visible');
    expect(record.service).toBe('test');
  });
});

describe('metrics', () => {
  it('counts and snapshots', () => {
    const registry = createMetricsRegistry();
    const c = registry.counter('bids_accepted_total');
    c.inc();
    c.inc(2);
    expect(c.get()).toBe(3);
    expect(registry.snapshot()).toEqual({ bids_accepted_total: 3 });
  });
});

describe('correlation', () => {
  it('propagates a correlation id within its async scope', () => {
    const id = newCorrelationId();
    expect(getCorrelationId()).toBeUndefined();
    const seen = runWithCorrelation(id, () => getCorrelationId());
    expect(seen).toBe(id);
    expect(getCorrelationId()).toBeUndefined();
  });
});
