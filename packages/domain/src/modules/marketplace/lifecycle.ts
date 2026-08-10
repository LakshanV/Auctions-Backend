import { IllegalTransition } from '../../kernel/errors';
import type { ListingStatus } from '../inventory/asset';

/**
 * Listing lifecycle state machine (docs/06):
 * Draft → Submitted → Review → Changes Required / Approved → Scheduled → Live →
 * Ended → Sold / Unsold / Withdrawn. UI is never the source of truth — the
 * server enforces legal transitions.
 */
export const LISTING_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['review', 'approved', 'changes_required', 'withdrawn'],
  review: ['approved', 'changes_required', 'withdrawn'],
  changes_required: ['submitted', 'withdrawn'],
  approved: ['scheduled', 'withdrawn'],
  scheduled: ['live', 'withdrawn'],
  live: ['ended', 'withdrawn'],
  ended: ['sold', 'unsold'],
  sold: [],
  unsold: [],
  withdrawn: [],
};

export function canTransitionListing(from: ListingStatus, to: ListingStatus): boolean {
  return LISTING_TRANSITIONS[from].includes(to);
}

/** Throw IllegalTransition unless `from → to` is a legal listing move. */
export function assertListingTransition(from: ListingStatus, to: ListingStatus): void {
  if (!canTransitionListing(from, to)) {
    throw new IllegalTransition(`Listing cannot move ${from} -> ${to}`);
  }
}
