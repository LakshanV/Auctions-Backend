import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Correlation context propagated across async boundaries so a request, its
 * emitted domain events and downstream work all share one correlation id
 * (docs/16 "correlate/log"; docs/18 "structured logs/correlation").
 */
interface CorrelationStore {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

export function newCorrelationId(): string {
  return globalThis.crypto.randomUUID();
}

export function runWithCorrelation<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
