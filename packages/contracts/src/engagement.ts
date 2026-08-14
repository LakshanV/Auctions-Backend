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
