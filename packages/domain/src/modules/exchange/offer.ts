import { IllegalTransition } from '../../kernel/errors';

/**
 * Make-Offer negotiation lifecycle (docs/07). An offer can be countered any
 * number of times (open ↔ countered) before it terminates in
 * accepted / rejected / withdrawn / expired. Every move is appended to an
 * immutable OfferEvent history.
 */
export const OFFER_STATUSES = [
  'open',
  'countered',
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_TERMINAL: readonly OfferStatus[] = [
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
];

export const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  open: ['countered', 'accepted', 'rejected', 'withdrawn', 'expired'],
  countered: ['countered', 'accepted', 'rejected', 'withdrawn', 'expired'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
};

export function canTransitionOffer(from: OfferStatus, to: OfferStatus): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

export function assertOfferTransition(from: OfferStatus, to: OfferStatus): void {
  if (!canTransitionOffer(from, to)) {
    throw new IllegalTransition(`Offer cannot move ${from} -> ${to}`);
  }
}

/** A party's response to an offer maps to (event type, resulting status). */
export const OFFER_RESPONSES = {
  counter: { type: 'counter', status: 'countered' },
  accept: { type: 'accept', status: 'accepted' },
  reject: { type: 'reject', status: 'rejected' },
} as const satisfies Record<string, { type: string; status: OfferStatus }>;
export type OfferResponse = keyof typeof OFFER_RESPONSES;
