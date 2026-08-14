import { type RivalryMoment, type RivalryView } from '@singha/contracts';

/**
 * Bid Battle rivalry engine — PURE, deterministic, rebuildable (pack doc 05).
 *
 * It replays the immutable, append-only Bid ledger for a single auction into a
 * non-authoritative rivalry read model: current leader vs nearest challenger, lead
 * changes, comebacks (a bidder who regains the lead after losing it) and the recent
 * head-to-head sequence. It NEVER writes to the ledger, NEVER decides bid validity, and
 * consumes only public accepted-bid facts (sequence, bidder, amount) — never the private
 * proxy maximum (`BidderMax`) or any Tier-A score. Drop the projection and recompute it
 * from the ledger at any time and get the identical result.
 *
 * Privacy: real bidder identities stay server-side. Every participant is mapped to a
 * stable, non-reversible alias derived from first-appearance ORDER within the auction, so
 * the same person gets a different alias in a different auction (unlinkable across sales).
 * The safe `RivalryView` exposes aliases only — never a bidderId.
 */

/** Bump when the projection's shape changes so cached projections rebuild. */
export const RIVALRY_VERSION = 1;

/** One accepted bid from the immutable ledger (public facts only). */
export interface LedgerBid {
  sequence: number;
  bidderId: string;
  amountMinor: number;
}

/** A single transfer of the lead between two different bidders. */
export interface LeadChange {
  sequence: number;
  newLeaderId: string;
  /** The bidder who just lost the lead, or null for the very first bid. */
  displacedLeaderId: string | null;
  /** True when `newLeaderId` had held the lead before and has now regained it. */
  isComeback: boolean;
}

/** Internal projection — carries bidderIds; NEVER serialised to a client (use `toRivalryView`). */
export interface RivalryProjection {
  version: number;
  auctionId: string;
  /** BidderIds in first-appearance order; the index is the alias slot. */
  aliasOrder: string[];
  leaderId: string | null;
  challengerId: string | null;
  currentHighMinor: number | null;
  activeBidderCount: number;
  totalBids: number;
  leadChanges: number;
  changes: LeadChange[];
  builtAt: string;
}

// Premium, non-casino alias vocabulary (pack doc 05: "Red Lion 42" flavour, never a real
// name). Two 16-long lists give 256 unique two-word aliases before any numeric suffix, so
// the number never leaks the bidder count for realistically-sized auctions.
const ADJECTIVES = [
  'Amber',
  'Cobalt',
  'Crimson',
  'Emerald',
  'Golden',
  'Ivory',
  'Jade',
  'Onyx',
  'Opal',
  'Pearl',
  'Ruby',
  'Sable',
  'Sapphire',
  'Scarlet',
  'Silver',
  'Violet',
];
const ANIMALS = [
  'Lion',
  'Falcon',
  'Tiger',
  'Panther',
  'Eagle',
  'Wolf',
  'Heron',
  'Stallion',
  'Cobra',
  'Leopard',
  'Osprey',
  'Jaguar',
  'Raven',
  'Lynx',
  'Bison',
  'Hawk',
];

/**
 * A stable, privacy-safe public alias for the bidder occupying alias slot `index`
 * (0-based, first-appearance order). Deterministic and collision-free.
 */
export function bidderAlias(index: number): string {
  if (index < 0) return 'Bidder';
  const adj = ADJECTIVES[index % ADJECTIVES.length];
  const animal = ANIMALS[Math.floor(index / ADJECTIVES.length) % ANIMALS.length];
  const wrap = Math.floor(index / (ADJECTIVES.length * ANIMALS.length));
  return wrap > 0 ? `${adj} ${animal} ${wrap + 1}` : `${adj} ${animal}`;
}

/**
 * Rebuild the rivalry projection from a single auction's accepted bids. Input order does
 * not matter — bids are sorted by their ledger `sequence` first, so the result is a pure
 * function of the ledger.
 */
export function buildRivalryProjection(
  auctionId: string,
  bids: readonly LedgerBid[],
  now: Date = new Date(),
): RivalryProjection {
  const ordered = [...bids].sort((a, b) => a.sequence - b.sequence);

  const aliasOrder: string[] = [];
  const seenBidder = new Set<string>();
  const bestByBidder = new Map<string, number>();
  const hasLedBefore = new Set<string>();
  const changes: LeadChange[] = [];

  let leaderId: string | null = null;
  let currentHighMinor: number | null = null;
  let leadChanges = 0;

  for (const bid of ordered) {
    if (!seenBidder.has(bid.bidderId)) {
      seenBidder.add(bid.bidderId);
      aliasOrder.push(bid.bidderId);
    }
    const prevBest = bestByBidder.get(bid.bidderId);
    if (prevBest == null || bid.amountMinor > prevBest) {
      bestByBidder.set(bid.bidderId, bid.amountMinor);
    }

    // Accepted bids strictly ascend; the newest accepted bid is the high.
    currentHighMinor = bid.amountMinor;

    if (bid.bidderId !== leaderId) {
      const displacedLeaderId = leaderId;
      const isComeback = hasLedBefore.has(bid.bidderId);
      changes.push({
        sequence: bid.sequence,
        newLeaderId: bid.bidderId,
        displacedLeaderId,
        isComeback,
      });
      // The very first bid establishes a leader but is not a "change" of hands.
      if (displacedLeaderId !== null) leadChanges += 1;
      hasLedBefore.add(bid.bidderId);
      leaderId = bid.bidderId;
    }
  }

  // Nearest active challenger: the non-leader bidder with the highest best bid.
  let challengerId: string | null = null;
  let challengerBest = -Infinity;
  for (const [bidderId, best] of bestByBidder) {
    if (bidderId === leaderId) continue;
    if (best > challengerBest) {
      challengerBest = best;
      challengerId = bidderId;
    }
  }

  return {
    version: RIVALRY_VERSION,
    auctionId,
    aliasOrder,
    leaderId,
    challengerId,
    currentHighMinor,
    activeBidderCount: aliasOrder.length,
    totalBids: ordered.length,
    leadChanges,
    changes,
    builtAt: now.toISOString(),
  };
}

export interface RivalryViewOptions {
  /** The signed-in viewer's bidderId, so their own entries render as "You". */
  viewerBidderId?: string | null;
  /** The auction increment (minor units) to compute the next valid bid / gap. */
  incrementMinor?: number | null;
  /** Cap on the number of recent moments returned (default 6). */
  maxMoments?: number;
}

/**
 * Project the internal rivalry model into the SAFE, viewer-aware `RivalryView`. Maps every
 * bidderId to a stable alias (or "You" for the viewer) and drops all Tier-A/PII fields.
 */
export function toRivalryView(p: RivalryProjection, opts: RivalryViewOptions = {}): RivalryView {
  const viewer = opts.viewerBidderId ?? null;
  const increment = opts.incrementMinor ?? null;
  const maxMoments = opts.maxMoments ?? 6;

  const aliasFor = (bidderId: string | null): string | null => {
    if (bidderId == null) return null;
    if (viewer != null && bidderId === viewer) return 'You';
    const idx = p.aliasOrder.indexOf(bidderId);
    return bidderAlias(idx);
  };

  const nextValidBidMinor =
    p.currentHighMinor != null && increment != null ? p.currentHighMinor + increment : null;

  // Build the narrative from lead changes: each change is a lead_taken/comeback moment,
  // and any change that displaces the viewer is also a "you were outbid" moment.
  const moments: RivalryMoment[] = [];
  for (const c of p.changes) {
    const who = aliasFor(c.newLeaderId);
    if (who != null) {
      moments.push({ kind: c.isComeback ? 'comeback' : 'lead_taken', who, sequence: c.sequence });
    }
    if (viewer != null && c.displacedLeaderId === viewer) {
      const by = aliasFor(c.newLeaderId);
      if (by != null) moments.push({ kind: 'you_outbid', who: by, sequence: c.sequence });
    }
  }
  // Most-recent window, returned oldest→newest for a stable strip.
  moments.sort((a, b) => a.sequence - b.sequence);
  const trimmed = moments.slice(Math.max(0, moments.length - maxMoments));

  return {
    auctionId: p.auctionId,
    currentHighMinor: p.currentHighMinor,
    nextValidBidMinor,
    gapToNextMinor: increment,
    activeBidderCount: p.activeBidderCount,
    totalBids: p.totalBids,
    leadChanges: p.leadChanges,
    youAreLeading: viewer != null && p.leaderId === viewer,
    leader: aliasFor(p.leaderId),
    challenger: aliasFor(p.challengerId),
    moments: trimmed,
  };
}
