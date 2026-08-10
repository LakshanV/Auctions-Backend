import { type EventEnvelope } from '@singha/contracts';

/**
 * Transactional outbox record (docs/16). A domain event is written to the outbox
 * in the SAME transaction as the business change; a dispatcher then publishes it
 * with at-least-once delivery. Consumers are idempotent.
 */
export type OutboxStatus = 'pending' | 'dispatched' | 'failed';

export interface OutboxRecord {
  id: string;
  eventId: string;
  name: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId: string | null;
  /** JSON-serialized payload — opaque to the dispatcher. */
  payload: string;
  payloadVersion: number;
  occurredAt: string;
  status: OutboxStatus;
  attempts: number;
}

/** Map a validated envelope into a persistable outbox row (status = pending). */
export function toOutboxRecord(envelope: EventEnvelope): OutboxRecord {
  return {
    id: envelope.eventId,
    eventId: envelope.eventId,
    name: envelope.name,
    aggregateType: envelope.aggregateType,
    aggregateId: envelope.aggregateId,
    correlationId: envelope.correlationId,
    causationId: envelope.causationId,
    payload: JSON.stringify(envelope.payload),
    payloadVersion: envelope.payloadVersion,
    occurredAt: envelope.occurredAt,
    status: 'pending',
    attempts: 0,
  };
}
