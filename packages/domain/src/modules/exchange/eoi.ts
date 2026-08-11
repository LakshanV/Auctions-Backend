import { IllegalTransition } from '../../kernel/errors';

/**
 * Expression-of-Interest lifecycle (docs/07 — EOI):
 * Submitted → Under Review → Shortlisted → Negotiating →
 * Accepted / Declined / Withdrawn / Expired.
 *
 * EOI values are PRIVATE: a bidder's amount/message/conditions are never exposed
 * to competing bidders. The server is authoritative over legal transitions; the
 * UI never is.
 */
export const EOI_STATUSES = [
  'submitted',
  'under_review',
  'shortlisted',
  'negotiating',
  'accepted',
  'declined',
  'withdrawn',
  'expired',
] as const;
export type EoiStatus = (typeof EOI_STATUSES)[number];

/** Terminal states never transition again. */
export const EOI_TERMINAL: readonly EoiStatus[] = ['accepted', 'declined', 'withdrawn', 'expired'];

export const EOI_TRANSITIONS: Record<EoiStatus, EoiStatus[]> = {
  submitted: ['under_review', 'shortlisted', 'declined', 'withdrawn', 'expired'],
  under_review: ['shortlisted', 'negotiating', 'declined', 'withdrawn', 'expired'],
  shortlisted: ['negotiating', 'declined', 'withdrawn', 'expired'],
  negotiating: ['accepted', 'declined', 'withdrawn', 'expired'],
  accepted: [],
  declined: [],
  withdrawn: [],
  expired: [],
};

export function canTransitionEoi(from: EoiStatus, to: EoiStatus): boolean {
  return EOI_TRANSITIONS[from].includes(to);
}

/** Throw IllegalTransition unless `from → to` is a legal EOI move. */
export function assertEoiTransition(from: EoiStatus, to: EoiStatus): void {
  if (!canTransitionEoi(from, to)) {
    throw new IllegalTransition(`EOI cannot move ${from} -> ${to}`);
  }
}

/** A review decision maps to its target status (docs/07 states). */
export const EOI_REVIEW_DECISIONS = {
  review: 'under_review',
  shortlist: 'shortlisted',
  negotiate: 'negotiating',
  accept: 'accepted',
  decline: 'declined',
} as const satisfies Record<string, EoiStatus>;
export type EoiReviewDecision = keyof typeof EOI_REVIEW_DECISIONS;
