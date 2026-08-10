import { createEnvelope, DomainEventName, newId, type EventEnvelope } from '@singha/contracts';

/**
 * Shared test helpers (docs/03 test-utils package). Kept provider-free so unit,
 * integration and E2E layers can all import the same builders.
 */

/** Temporarily set env vars for the duration of `fn`, then restore. */
export async function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Build a valid domain-event envelope with sensible test defaults. */
export function anEvent(
  overrides: Partial<Parameters<typeof createEnvelope>[0]> = {},
): EventEnvelope {
  return createEnvelope({
    name: DomainEventName.BidAccepted,
    aggregateType: 'Auction',
    aggregateId: newId(),
    actor: { type: 'system', id: null },
    payload: {},
    ...overrides,
  });
}
