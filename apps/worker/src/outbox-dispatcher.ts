/**
 * Transactional-outbox dispatcher (docs/16). Reads pending events and publishes
 * them with at-least-once delivery; failures increment attempts and are retried
 * on the next sweep. Written against small interfaces so it unit-tests without a
 * database or Redis. The Prisma/BullMQ wiring lives in main.ts.
 */
export interface OutboxRow {
  id: string;
  eventId: string;
  name: string;
  aggregateId: string;
  payload: unknown;
}

export interface OutboxRepo {
  fetchPending(limit: number): Promise<OutboxRow[]>;
  markDispatched(id: string, at: Date): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export type PublishFn = (row: OutboxRow) => Promise<void>;

export interface SweepResult {
  dispatched: number;
  failed: number;
}

export async function processOutboxBatch(
  repo: OutboxRepo,
  publish: PublishFn,
  limit = 50,
): Promise<SweepResult> {
  const rows = await repo.fetchPending(limit);
  let dispatched = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await publish(row);
      await repo.markDispatched(row.id, new Date());
      dispatched += 1;
    } catch (error) {
      await repo.markFailed(row.id, error instanceof Error ? error.message : String(error));
      failed += 1;
    }
  }

  return { dispatched, failed };
}
