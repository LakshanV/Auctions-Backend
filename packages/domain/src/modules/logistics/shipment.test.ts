import { describe, expect, it } from 'vitest';
import { assertShipmentTransition, canTransitionShipment } from './shipment';

describe('shipment lifecycle (pack 10)', () => {
  it('advances forward through the happy path', () => {
    expect(canTransitionShipment('BOOKED', 'PICKED_UP')).toBe(true);
    expect(canTransitionShipment('PICKED_UP', 'IN_TRANSIT')).toBe(true);
    expect(canTransitionShipment('IN_TRANSIT', 'ARRIVED')).toBe(true);
    expect(canTransitionShipment('ARRIVED', 'DELIVERED')).toBe(true);
  });

  it('allows cancellation from any non-terminal state', () => {
    expect(canTransitionShipment('BOOKED', 'CANCELLED')).toBe(true);
    expect(canTransitionShipment('IN_TRANSIT', 'CANCELLED')).toBe(true);
  });

  it('rejects skips, reversals and moves out of a terminal state', () => {
    expect(canTransitionShipment('BOOKED', 'DELIVERED')).toBe(false); // skip
    expect(canTransitionShipment('IN_TRANSIT', 'BOOKED')).toBe(false); // reversal
    expect(canTransitionShipment('DELIVERED', 'IN_TRANSIT')).toBe(false); // terminal
    expect(() => assertShipmentTransition('DELIVERED', 'CANCELLED')).toThrow();
  });
});
