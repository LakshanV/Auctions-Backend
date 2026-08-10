import { describe, expect, it } from 'vitest';
import { createEnvelope, DomainEventName } from '@singha/contracts';
import { toOutboxRecord } from './outbox';

describe('outbox mapping', () => {
  it('serializes an envelope into a pending outbox row', () => {
    const envelope = createEnvelope({
      name: DomainEventName.AuctionClosed,
      aggregateType: 'Auction',
      aggregateId: 'AUCTION-1',
      actor: { type: 'system', id: null },
      payload: { winnerBidId: 'BID-9', hammer: 250000 },
    });

    const row = toOutboxRecord(envelope);
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(0);
    expect(row.name).toBe('AUCTION_CLOSED');
    expect(row.eventId).toBe(envelope.eventId);
    expect(JSON.parse(row.payload)).toEqual({ winnerBidId: 'BID-9', hammer: 250000 });
  });
});
