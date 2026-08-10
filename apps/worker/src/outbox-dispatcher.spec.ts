import { describe, expect, it, vi } from 'vitest';
import { processOutboxBatch, type OutboxRepo, type OutboxRow } from './outbox-dispatcher';

function fakeRepo(rows: OutboxRow[]) {
  const dispatched: string[] = [];
  const failed: string[] = [];
  const repo: OutboxRepo = {
    fetchPending: async (limit) => rows.slice(0, limit),
    markDispatched: async (id) => void dispatched.push(id),
    markFailed: async (id) => void failed.push(id),
  };
  return { repo, dispatched, failed };
}

const row = (id: string): OutboxRow => ({
  id,
  eventId: id,
  name: 'AUCTION_CLOSED',
  aggregateId: 'A1',
  payload: {},
});

describe('processOutboxBatch', () => {
  it('dispatches all pending rows and marks them dispatched', async () => {
    const { repo, dispatched, failed } = fakeRepo([row('1'), row('2')]);
    const result = await processOutboxBatch(repo, async () => undefined);
    expect(result).toEqual({ dispatched: 2, failed: 0 });
    expect(dispatched).toEqual(['1', '2']);
    expect(failed).toEqual([]);
  });

  it('marks a row failed when publishing throws, without aborting the batch', async () => {
    const { repo, dispatched, failed } = fakeRepo([row('1'), row('2')]);
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error('channel down'))
      .mockResolvedValueOnce(undefined);
    const result = await processOutboxBatch(repo, publish);
    expect(result).toEqual({ dispatched: 1, failed: 1 });
    expect(failed).toEqual(['1']);
    expect(dispatched).toEqual(['2']);
  });
});
