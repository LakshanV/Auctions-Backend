import { describe, expect, it } from 'vitest';
import {
  type NotificationEvent,
  type NotificationPreferences,
  type RecentDelivery,
  decideNotification,
  dedupeKeyFor,
  defaultPreferences,
  inQuietHours,
} from './notifications';

const NOW = new Date('2026-08-14T12:00:00.000Z'); // 12:00 UTC

function prefs(over: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return { ...defaultPreferences(), engagementOptIn: true, ...over };
}
function ev(over: Partial<NotificationEvent> = {}): NotificationEvent {
  return { eventType: 'ENDING_SOON', classification: 'engagement', subjectId: 'auc-1', ...over };
}
const recent = (...d: Partial<RecentDelivery>[]): RecentDelivery[] =>
  d.map((x) => ({
    dedupeKey: 'ENDING_SOON:auc-1',
    classification: 'engagement',
    createdAtEpochMs: NOW.getTime(),
    ...x,
  }));

describe('notification policy engine (pack doc 05)', () => {
  it('sends an opted-in engagement notification on enabled channels', () => {
    const d = decideNotification(ev(), prefs(), [], NOW);
    expect(d.send).toBe(true);
    expect(d.channels).toContain('email'); // default enabled
    expect(d.channels).not.toContain('sms'); // default disabled
  });

  it('suppresses engagement when the customer has not opted in', () => {
    const d = decideNotification(ev(), prefs({ engagementOptIn: false }), [], NOW);
    expect(d.send).toBe(false);
    expect(d.suppressedReason).toBe('not_opted_in');
  });

  it('always delivers transactional messages, ignoring opt-in, with an in-app floor', () => {
    const d = decideNotification(
      ev({ eventType: 'PAYMENT_DUE', classification: 'transactional' }),
      prefs({
        engagementOptIn: false,
        channels: { in_app: false, push: false, email: false, sms: false, whatsapp: false },
      }),
      [],
      NOW,
    );
    expect(d.send).toBe(true);
    expect(d.channels).toContain('in_app'); // mandatory floor even with all channels off
  });

  it('de-duplicates a re-emitted event within the window (both classes)', () => {
    const d = decideNotification(
      ev(),
      prefs(),
      recent({ createdAtEpochMs: NOW.getTime() - 60_000 }),
      NOW,
    );
    expect(d.send).toBe(false);
    expect(d.suppressedReason).toBe('duplicate');
    // A transactional retry of the same subject also dedupes.
    const t = decideNotification(
      ev({ classification: 'transactional' }),
      prefs(),
      recent({ classification: 'transactional', createdAtEpochMs: NOW.getTime() - 60_000 }),
      NOW,
    );
    expect(t.send).toBe(false);
  });

  it('re-notifies once the dedupe window has elapsed', () => {
    const old = recent({ createdAtEpochMs: NOW.getTime() - 7 * 3_600_000 }); // 7h ago > 6h window
    expect(decideNotification(ev(), prefs(), old, NOW).send).toBe(true);
  });

  it('respects category mutes for engagement only', () => {
    const p = prefs({ mutedCategories: ['vehicles'] });
    expect(decideNotification(ev({ category: 'vehicles' }), p, [], NOW).suppressedReason).toBe(
      'category_muted',
    );
    // Transactional ignores the mute.
    expect(
      decideNotification(ev({ category: 'vehicles', classification: 'transactional' }), p, [], NOW)
        .send,
    ).toBe(true);
  });

  it('holds engagement during quiet hours but lets transactional through', () => {
    // Quiet 09:00–18:00 local; NOW=12:00 UTC, tz 0 → inside.
    const p = prefs({
      quietHours: { startMinute: 9 * 60, endMinute: 18 * 60 },
      timezoneOffsetMinutes: 0,
    });
    expect(inQuietHours(p, NOW)).toBe(true);
    expect(decideNotification(ev(), p, [], NOW).suppressedReason).toBe('quiet_hours');
    expect(decideNotification(ev({ classification: 'transactional' }), p, [], NOW).send).toBe(true);
  });

  it('evaluates overnight (wrapping) quiet hours correctly', () => {
    // Quiet 22:00–07:00 local. NOW 12:00 UTC → NOT quiet at tz 0.
    const p = prefs({
      quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
      timezoneOffsetMinutes: 0,
    });
    expect(inQuietHours(p, NOW)).toBe(false);
    // Shift tz +660 → local 23:00 → quiet.
    expect(inQuietHours({ ...p, timezoneOffsetMinutes: 11 * 60 }, NOW)).toBe(true);
  });

  it('enforces the per-day engagement frequency cap (transactional exempt)', () => {
    const p = prefs({ frequencyCapPerDay: 2 });
    const two = [
      ...recent({ dedupeKey: 'X:1', createdAtEpochMs: NOW.getTime() - 1000 }),
      ...recent({ dedupeKey: 'Y:2', createdAtEpochMs: NOW.getTime() - 2000 }),
    ];
    expect(decideNotification(ev({ subjectId: 'auc-9' }), p, two, NOW).suppressedReason).toBe(
      'frequency_cap',
    );
    // Transactional is not capped.
    expect(
      decideNotification(ev({ subjectId: 'auc-9', classification: 'transactional' }), p, two, NOW)
        .send,
    ).toBe(true);
  });

  it('suppresses when no channel is enabled (engagement)', () => {
    const p = prefs({
      channels: { in_app: false, push: false, email: false, sms: false, whatsapp: false },
    });
    expect(decideNotification(ev(), p, [], NOW).suppressedReason).toBe('no_channel');
  });

  it('produces a stable dedupe key', () => {
    expect(dedupeKeyFor(ev())).toBe('ENDING_SOON:auc-1');
    expect(dedupeKeyFor(ev())).toBe(dedupeKeyFor(ev()));
  });
});
