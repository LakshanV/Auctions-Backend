/**
 * Engagement notification policy engine — PURE, deterministic (pack doc 05).
 *
 * Given an event, the customer's preferences and their recent delivery history, it
 * decides WHETHER to notify, on WHICH channels, and — when suppressed — WHY. All the
 * consent / quiet-hours / frequency / dedup policy lives here (Tier-A), never in the
 * transport or the UI. The two message classes are treated very differently:
 *
 *   - `transactional` (outbid-resolved, won, payment due, offer/settlement state): a
 *     mandatory record. It ignores marketing opt-in, quiet hours, category mutes and
 *     frequency caps, and always keeps an in-app floor so the customer has the record.
 *   - `engagement` (nudges, "ending soon", rivalry): requires opt-in and respects
 *     category mutes, quiet hours and the per-day frequency cap.
 *
 * Both classes are de-duplicated on a stable key so a retried or double-emitted event
 * never notifies twice.
 */

export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'email', 'sms', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationClass = 'transactional' | 'engagement';

/** Minutes-of-day window [start, end); when start > end it wraps past midnight. */
export interface QuietHours {
  startMinute: number;
  endMinute: number;
}

export interface NotificationPreferences {
  /** Which channels the customer accepts at all. */
  channels: Record<NotificationChannel, boolean>;
  /** Consent for engagement/marketing messages (transactional ignores this). */
  engagementOptIn: boolean;
  /** Quiet hours in the customer's local time; engagement is held during this window. */
  quietHours: QuietHours | null;
  /** Local-time offset in minutes for quiet-hours evaluation (e.g. +330 for Asia/Colombo). */
  timezoneOffsetMinutes: number;
  /** Max engagement notifications per rolling 24h (0 = unlimited). */
  frequencyCapPerDay: number;
  /** Interest categories the customer has muted for engagement. */
  mutedCategories: string[];
}

/** A safe, sensible default: transactional on, engagement off until opted in. */
export function defaultPreferences(): NotificationPreferences {
  return {
    channels: { in_app: true, push: false, email: true, sms: false, whatsapp: false },
    engagementOptIn: false,
    quietHours: null,
    timezoneOffsetMinutes: 0,
    frequencyCapPerDay: 8,
    mutedCategories: [],
  };
}

export interface NotificationEvent {
  eventType: string;
  classification: NotificationClass;
  /** Interest category, for engagement category mutes. */
  category?: string | null;
  /** The aggregate the event is about (auction/lot/offer id) — part of the dedupe key. */
  subjectId: string;
}

export interface RecentDelivery {
  dedupeKey: string;
  classification: NotificationClass;
  createdAtEpochMs: number;
}

export type SuppressReason =
  'duplicate' | 'not_opted_in' | 'category_muted' | 'quiet_hours' | 'frequency_cap' | 'no_channel';

export interface NotificationDecision {
  send: boolean;
  suppressedReason: SuppressReason | null;
  channels: NotificationChannel[];
  dedupeKey: string;
  classification: NotificationClass;
}

const DEDUPE_WINDOW_MS = 6 * 3_600_000; // 6h — a re-emitted event within this window is a dupe
const DAY_MS = 24 * 3_600_000;

/** Stable de-duplication key for an event (per-customer scope is applied by the caller). */
export function dedupeKeyFor(event: NotificationEvent): string {
  return `${event.eventType}:${event.subjectId}`;
}

function enabledChannels(prefs: NotificationPreferences): NotificationChannel[] {
  return NOTIFICATION_CHANNELS.filter((c) => prefs.channels[c]);
}

/** True when `now` falls inside the customer's local quiet-hours window. */
export function inQuietHours(prefs: NotificationPreferences, now: Date): boolean {
  const q = prefs.quietHours;
  if (!q) return false;
  const localMinutes =
    (((Math.floor(now.getTime() / 60_000) + prefs.timezoneOffsetMinutes) % 1440) + 1440) % 1440;
  return q.startMinute <= q.endMinute
    ? localMinutes >= q.startMinute && localMinutes < q.endMinute
    : localMinutes >= q.startMinute || localMinutes < q.endMinute; // wraps midnight
}

/**
 * Decide how to handle one event for one customer. Deterministic in (`event`, `prefs`,
 * `recent`, `now`). `recent` is that customer's recent delivery ledger.
 */
export function decideNotification(
  event: NotificationEvent,
  prefs: NotificationPreferences,
  recent: readonly RecentDelivery[],
  now: Date = new Date(),
): NotificationDecision {
  const dedupeKey = dedupeKeyFor(event);
  const nowMs = now.getTime();
  const suppress = (reason: SuppressReason): NotificationDecision => ({
    send: false,
    suppressedReason: reason,
    channels: [],
    dedupeKey,
    classification: event.classification,
  });

  // Idempotency / dedup — applies to BOTH classes.
  if (
    recent.some((r) => r.dedupeKey === dedupeKey && nowMs - r.createdAtEpochMs < DEDUPE_WINDOW_MS)
  ) {
    return suppress('duplicate');
  }

  if (event.classification === 'transactional') {
    // Mandatory: ignore opt-in / quiet hours / caps / mutes, but keep an in-app floor.
    const channels = enabledChannels(prefs);
    if (!channels.includes('in_app')) channels.unshift('in_app');
    return {
      send: true,
      suppressedReason: null,
      channels,
      dedupeKey,
      classification: 'transactional',
    };
  }

  // Engagement: consent + category + quiet hours + frequency cap.
  if (!prefs.engagementOptIn) return suppress('not_opted_in');
  if (event.category && prefs.mutedCategories.includes(event.category))
    return suppress('category_muted');
  if (inQuietHours(prefs, now)) return suppress('quiet_hours');
  if (prefs.frequencyCapPerDay > 0) {
    const inWindow = recent.filter(
      (r) => r.classification === 'engagement' && nowMs - r.createdAtEpochMs < DAY_MS,
    ).length;
    if (inWindow >= prefs.frequencyCapPerDay) return suppress('frequency_cap');
  }
  const channels = enabledChannels(prefs);
  if (channels.length === 0) return suppress('no_channel');
  return { send: true, suppressedReason: null, channels, dedupeKey, classification: 'engagement' };
}
