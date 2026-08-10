import { describe, expect, it } from 'vitest';
import {
  ALL_DOMAIN_EVENT_NAMES,
  DomainEventName,
  createEnvelope,
  eventEnvelopeSchema,
} from './events';

describe('domain events', () => {
  it('exposes a stable, additive set of event names', () => {
    expect(ALL_DOMAIN_EVENT_NAMES).toContain('BID_ACCEPTED');
    expect(ALL_DOMAIN_EVENT_NAMES).toContain('SALE_CONFIRMED');
    // No duplicates — each canonical name appears once.
    expect(new Set(ALL_DOMAIN_EVENT_NAMES).size).toBe(ALL_DOMAIN_EVENT_NAMES.length);
  });

  it('creates a valid, self-describing envelope with defaults', () => {
    const env = createEnvelope({
      name: DomainEventName.BidAccepted,
      aggregateType: 'Auction',
      aggregateId: 'AUCTION-1',
      actor: { type: 'customer', id: 'CUST-1' },
      payload: { amount: 1000, currency: 'LKR' },
    });

    expect(() => eventEnvelopeSchema.parse(env)).not.toThrow();
    expect(env.name).toBe('BID_ACCEPTED');
    expect(env.payloadVersion).toBe(1);
    expect(env.correlationId).toBeTruthy();
    expect(env.causationId).toBeNull();
    expect(new Date(env.occurredAt).toISOString()).toBe(env.occurredAt);
  });

  it('rejects an unknown event name', () => {
    expect(() =>
      eventEnvelopeSchema.parse({
        eventId: 'x',
        name: 'NOT_A_REAL_EVENT',
        occurredAt: new Date().toISOString(),
        aggregateType: 'Auction',
        aggregateId: 'A1',
        correlationId: 'c1',
        actor: { type: 'system', id: null },
        payload: {},
      }),
    ).toThrow();
  });
});
