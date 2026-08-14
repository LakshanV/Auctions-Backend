/**
 * Bid Battle + Engagement public contracts (pack doc 05). The rivalry projection is a
 * REBUILDABLE, NON-authoritative read model derived from the immutable Bid ledger — it
 * never writes to the ledger and never decides bid validity. Real bidder identities are
 * NEVER exposed: every other participant is shown only as a privacy-safe alias that is
 * stable within a single auction/event. The viewer sees their own position as "You".
 *
 * Nothing Tier-A crosses this boundary: no bidderId, no proxy maximum, no internal
 * rivalry score/weight. The client receives aliases, public bid amounts and counts only.
 */
import { z } from 'zod';

/** A narrative moment for the Bid Battle strip. `who` is an alias or "You" — never a PII value. */
export interface RivalryMoment {
  kind: 'lead_taken' | 'comeback' | 'you_outbid';
  who: string;
  /** The bid ledger sequence this moment corresponds to (for stable ordering/keys). */
  sequence: number;
}

/** The safe, viewer-aware Bid Battle view for one auction. */
export interface RivalryView {
  auctionId: string;
  /** Current high bid (public) in minor units, or null before the first bid. */
  currentHighMinor: number | null;
  /** The smallest next valid bid (high + increment), or null when unknown. */
  nextValidBidMinor: number | null;
  /** The gap from the current high to the next valid bid (the increment), or null. */
  gapToNextMinor: number | null;
  /** Distinct participants who have placed at least one accepted bid. */
  activeBidderCount: number;
  totalBids: number;
  /** How many times the lead passed between different bidders. */
  leadChanges: number;
  youAreLeading: boolean;
  /** Alias of the current leader, or "You", or null before any bid. */
  leader: string | null;
  /** Alias of the nearest active challenger, or "You", or null. */
  challenger: string | null;
  /** Recent moments, oldest→newest, capped server-side. */
  moments: RivalryMoment[];
}

// --- Engagement notification preferences + delivery (pack doc 05) -----------
// The consent / quiet-hours / frequency / dedup POLICY is Tier-A and lives in the
// domain engine; these contracts are only the safe customer-facing preference DTO,
// the update input, and the delivery-ledger view.

export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'email', 'sms', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Quiet hours as local "HH:mm" strings, or null for none. */
export const quietHoursSchema = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .nullable();

export const updateNotificationPreferencesSchema = z.object({
  channels: z.record(z.enum(NOTIFICATION_CHANNELS), z.boolean()).optional(),
  engagementOptIn: z.boolean().optional(),
  quietHours: quietHoursSchema.optional(),
  timezoneOffsetMinutes: z.number().int().min(-720).max(840).optional(),
  frequencyCapPerDay: z.number().int().min(0).max(50).optional(),
  mutedCategories: z.array(z.string().min(1).max(40)).max(50).optional(),
});
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;

/** The customer-facing preference view (safe: no internal thresholds/scoring). */
export interface NotificationPreferencesView {
  channels: Record<NotificationChannel, boolean>;
  engagementOptIn: boolean;
  quietHours: { start: string; end: string } | null;
  timezoneOffsetMinutes: number;
  frequencyCapPerDay: number;
  mutedCategories: string[];
}

/** One row of the append-only delivery ledger, safe for the customer to read. */
export interface NotificationDeliveryView {
  id: string;
  eventType: string;
  classification: 'transactional' | 'engagement';
  channel: NotificationChannel | null;
  status: 'sent' | 'suppressed' | 'failed' | 'dead';
  suppressedReason: string | null;
  title: string;
  body: string;
  createdAt: string;
}
