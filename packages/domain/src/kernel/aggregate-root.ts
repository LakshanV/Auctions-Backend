import { type EventEnvelope } from '@singha/contracts';

/**
 * Base class for aggregate roots. Aggregates record domain events in memory;
 * the application layer persists them to the transactional outbox in the SAME
 * database transaction as the state change (docs/16).
 */
export abstract class AggregateRoot<TId extends string> {
  private domainEvents: EventEnvelope[] = [];

  protected constructor(readonly id: TId) {}

  protected record(event: EventEnvelope): void {
    this.domainEvents.push(event);
  }

  /** Drain recorded events for persistence (clears the buffer). */
  pullEvents(): EventEnvelope[] {
    const events = this.domainEvents;
    this.domainEvents = [];
    return events;
  }

  get pendingEvents(): readonly EventEnvelope[] {
    return this.domainEvents;
  }
}
