import { describe, expect, it } from 'vitest';
import { recordAudit } from './audit-entry';
import { FixedClock } from '../../kernel/clock';

describe('audit entries', () => {
  it('stamps a server timestamp and is immutable once recorded', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    const entry = recordAudit(
      {
        actorType: 'staff',
        actorId: 'STAFF-1',
        action: 'RESERVE_CHANGED',
        targetType: 'Auction',
        targetId: 'AUCTION-1',
        correlationId: 'corr-1',
        reason: 'Vendor instruction',
        before: { reserve: 1000 },
        after: { reserve: 1200 },
      },
      clock,
    );

    expect(entry.occurredAt).toBe('2026-01-01T00:00:00.000Z');
    expect(entry.id).toHaveLength(26);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(() => {
      // @ts-expect-error entries are readonly business evidence
      entry.action = 'TAMPERED';
    }).toThrow();
  });
});
