import { IllegalTransition } from '../../kernel/errors';

/**
 * Shipment lifecycle (Evolution E7b, pack doc 10). A shipment is created from a booking and moves
 * through an append-only event timeline. Pure state-machine logic so the transitions can't drift.
 */
export const SHIPMENT_STATUSES = [
  'BOOKED',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_TERMINAL: readonly ShipmentStatus[] = ['DELIVERED', 'CANCELLED'];

export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  BOOKED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return SHIPMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertShipmentTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (!canTransitionShipment(from, to)) {
    throw new IllegalTransition(`Shipment cannot move ${from} -> ${to}`);
  }
}
