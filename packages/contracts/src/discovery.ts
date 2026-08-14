import { z } from 'zod';

/**
 * Singha Discover + Buyer Twin public contracts (pack docs 06/11). The append-only
 * DiscoveryEvent ledger and the rebuildable BuyerTwinProjection live server-side; the
 * ranking WEIGHTS and raw affinity scores are Tier-A and NEVER leave the backend
 * (pack doc 05/18). The frontend records events and consumes a SAFE summary
 * (labels + bucketed confidence + explanations), never raw weights.
 */

/** What a customer/anonymous session did with a lot (append-only ledger event). */
export const DISCOVERY_EVENT_TYPES = [
  'IMPRESSION',
  'OPEN',
  'WATCH',
  'UNWATCH',
  'LIKE',
  'DISLIKE',
  'SHARE',
  'BID_INTENT',
  'BID',
  'OFFER',
  'EOI',
  'PURCHASE',
] as const;
export type DiscoveryEventType = (typeof DISCOVERY_EVENT_TYPES)[number];

/** Where the interaction happened. */
export const SOURCE_SURFACES = [
  'FLOW',
  'DISCOVER',
  'HOME_FEATURED',
  'SEARCH',
  'DASHBOARD',
  'NOTIFICATION',
] as const;
export type SourceSurface = (typeof SOURCE_SURFACES)[number];

/**
 * Record a discovery signal. `metadata` is a STRICT primitive allow-list — never a
 * place for raw device fingerprints or sensitive personal traits (pack doc 06).
 */
export const recordDiscoveryEventSchema = z.object({
  listingId: z.string().min(1),
  eventType: z.enum(DISCOVERY_EVENT_TYPES),
  sourceSurface: z.enum(SOURCE_SURFACES).default('FLOW'),
  bandContext: z.string().max(60).optional(),
  anonymousSessionId: z.string().max(120).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type RecordDiscoveryEventInput = z.infer<typeof recordDiscoveryEventSchema>;

/**
 * The customer-facing Buyer Twin summary — safe projection fields ONLY. Raw scores,
 * weights and internal confidence are intentionally absent; confidence is bucketed
 * and the reasons are explainable labels derived from safe fields.
 */
export interface BuyerTwinSummary {
  version: number;
  topCategories: string[];
  dislikedCategories: string[];
  priceBandMinor: { min: number; max: number } | null;
  preferredSaleMethod: string | null;
  confidence: 'none' | 'low' | 'medium' | 'high';
  explanations: string[];
  builtAt: string | null;
}
