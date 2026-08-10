/**
 * Timed auction engine (docs/07) — PURE, deterministic core. The database
 * orchestration (locking, ledger append, event emission) lives in the API; this
 * module owns the maths so it is exhaustively unit-testable and never trusts a
 * client clock. Proxy maximums are private inputs; only the visible price and
 * leader are outputs.
 */
export interface AuctionConfig {
  openingBidMinor: number;
  incrementMinor: number;
  reserveMinor: number | null;
  softCloseTriggerSec: number;
  softCloseExtendSec: number;
  endsAt: Date;
}

export interface BidderMaxEntry {
  bidderId: string;
  maxMinor: number;
  /** Tie-break: at equal maximums the earliest-committed bidder leads. */
  updatedAt: Date;
}

export interface AuctionComputation {
  currentBidMinor: number;
  highBidderId: string | null;
  reserveMet: boolean;
}

export function reserveMet(reserveMinor: number | null, priceMinor: number): boolean {
  return reserveMinor == null ? true : priceMinor >= reserveMinor;
}

/**
 * The minimum acceptable incoming maximum: opening bid for the first bid,
 * otherwise the current price plus one increment.
 */
export function minimumAcceptableMax(
  config: AuctionConfig,
  currentBidMinor: number | null,
): number {
  if (currentBidMinor == null) return config.openingBidMinor;
  return currentBidMinor + config.incrementMinor;
}

/**
 * Compute the visible price + leader from all private proxy maximums. Standard
 * proxy rules: the highest max leads; the price is just enough to beat the
 * second-highest max by one increment, capped at the leader's own max.
 */
export function computeAuctionState(
  config: AuctionConfig,
  maxes: readonly BidderMaxEntry[],
): AuctionComputation {
  if (maxes.length === 0) {
    return {
      currentBidMinor: config.openingBidMinor,
      highBidderId: null,
      reserveMet: reserveMet(config.reserveMinor, config.openingBidMinor),
    };
  }

  const sorted = [...maxes].sort(
    (a, b) => b.maxMinor - a.maxMinor || a.updatedAt.getTime() - b.updatedAt.getTime(),
  );
  const leader = sorted[0]!;

  let price: number;
  if (sorted.length === 1) {
    price = config.openingBidMinor;
  } else {
    const second = sorted[1]!;
    price = Math.min(leader.maxMinor, second.maxMinor + config.incrementMinor);
    if (price < config.openingBidMinor) price = config.openingBidMinor;
  }

  return {
    currentBidMinor: price,
    highBidderId: leader.bidderId,
    reserveMet: reserveMet(config.reserveMinor, price),
  };
}

export interface SoftCloseResult {
  extended: boolean;
  endsAt: Date;
}

/**
 * Soft close: a bid inside the trigger window pushes the end time out so the
 * final moments cannot be sniped. Returns the (possibly) new end time.
 */
export function applySoftClose(config: AuctionConfig, now: Date): SoftCloseResult {
  const triggerAt = new Date(config.endsAt.getTime() - config.softCloseTriggerSec * 1000);
  const insideWindow = now >= triggerAt && now < config.endsAt;
  if (!insideWindow) return { extended: false, endsAt: config.endsAt };

  const candidate = new Date(now.getTime() + config.softCloseExtendSec * 1000);
  if (candidate <= config.endsAt) return { extended: false, endsAt: config.endsAt };
  return { extended: true, endsAt: candidate };
}

export function isEnded(endsAt: Date, now: Date): boolean {
  return now >= endsAt;
}
