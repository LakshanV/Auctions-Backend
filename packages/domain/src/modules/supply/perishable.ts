import { InvariantViolation } from '../../kernel/errors';
import { scaleDecimal } from './supply-programme';

/**
 * Perishable-goods engine (Evolution E10, owner req 24). PURE metadata logic for agricultural/food
 * listings: date ordering, temperature/moisture sanity, and the automatic-expiry predicate that lets
 * a listing retire itself once it is past its best-use date or shipment window (pack: "Listings
 * should support automatic expiry where appropriate").
 */

export interface PerishableView {
  harvestDate: Date | null;
  packingDate: Date | null;
  expiryDate: Date | null;
  moisturePercent: string | null;
  tempMinC: string | null;
  tempMaxC: string | null;
  shipmentWindowStart: Date | null;
  shipmentWindowEnd: Date | null;
}

/** Guard the descriptive invariants: harvest ≤ packing ≤ expiry, shipment window ordered, moisture
 *  in 0–100, tempMin ≤ tempMax. Throws `InvariantViolation` (→ HTTP 422) on any breach. */
export function assertPerishableConsistent(m: PerishableView): void {
  if (m.harvestDate && m.packingDate && m.harvestDate > m.packingDate) {
    throw new InvariantViolation('harvestDate cannot be after packingDate');
  }
  if (m.packingDate && m.expiryDate && m.packingDate > m.expiryDate) {
    throw new InvariantViolation('packingDate cannot be after expiryDate');
  }
  if (m.harvestDate && m.expiryDate && m.harvestDate > m.expiryDate) {
    throw new InvariantViolation('harvestDate cannot be after expiryDate');
  }
  if (m.shipmentWindowStart && m.shipmentWindowEnd && m.shipmentWindowStart > m.shipmentWindowEnd) {
    throw new InvariantViolation('shipmentWindowStart cannot be after shipmentWindowEnd');
  }
  if (m.moisturePercent != null) {
    const moisture = scaleDecimal(m.moisturePercent, 3);
    if (moisture < 0n || moisture > scaleDecimal('100', 3)) {
      throw new InvariantViolation('moisturePercent must be between 0 and 100');
    }
  }
  if (m.tempMinC != null && m.tempMaxC != null) {
    if (scaleDecimal(m.tempMinC, 3) > scaleDecimal(m.tempMaxC, 3)) {
      throw new InvariantViolation('tempMinC cannot exceed tempMaxC');
    }
  }
}

/**
 * The effective automatic-expiry instant: the earliest of the best-use date and the shipment-window
 * end (either bound alone governs; null when neither is set — the item never auto-expires).
 */
export function perishableExpiresAt(m: PerishableView): Date | null {
  const candidates = [m.expiryDate, m.shipmentWindowEnd].filter((d): d is Date => d != null);
  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, d) => (d < earliest ? d : earliest));
}

/** True once `now` is strictly past the effective expiry instant. */
export function isPerishableExpired(m: PerishableView, now: Date): boolean {
  const at = perishableExpiresAt(m);
  return at != null && now > at;
}
