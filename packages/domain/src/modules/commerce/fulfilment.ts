import { IllegalTransition } from '../../kernel/errors';

/**
 * Fulfilment lifecycle (docs/14). Release requires authoritative server state —
 * never a customer screenshot. The state machine is enforced server-side.
 */
export const FULFILMENT_STATES = [
  'payment_pending',
  'payment_confirmed',
  'release_approved',
  'ready_for_pickup',
  'pickup_booked',
  'in_delivery',
  'collected',
  'delivered',
  'completed',
] as const;
export type FulfilmentState = (typeof FULFILMENT_STATES)[number];

export const FULFILMENT_TRANSITIONS: Record<FulfilmentState, FulfilmentState[]> = {
  payment_pending: ['payment_confirmed'],
  payment_confirmed: ['release_approved'],
  release_approved: ['ready_for_pickup'],
  ready_for_pickup: ['pickup_booked', 'in_delivery'],
  pickup_booked: ['collected'],
  in_delivery: ['delivered'],
  collected: ['completed'],
  delivered: ['completed'],
  completed: [],
};

export function canTransitionFulfilment(from: FulfilmentState, to: FulfilmentState): boolean {
  return FULFILMENT_TRANSITIONS[from].includes(to);
}

export function assertFulfilmentTransition(from: FulfilmentState, to: FulfilmentState): void {
  if (!canTransitionFulfilment(from, to)) {
    throw new IllegalTransition(`Fulfilment cannot move ${from} -> ${to}`);
  }
}
