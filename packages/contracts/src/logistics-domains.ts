import { z } from 'zod';

/**
 * Logistics / Ports / Incoterms contracts (Evolution E7, pack doc 10). Neutral, configurable
 * entities — ports/airports/depots, transport methods, providers, and Incoterms — plus the quote
 * engine. A quote is NOT a booking: it persists its assumptions, provider and expiry (pack §10).
 * Money stays in integer minor units; estimates are deterministic and float-free (DECISIONS
 * D5/D6). Live provider quotes await owner register O6; a credential-free fake supplies
 * deterministic estimates until then.
 */

/** Configurable Incoterm (trade term). `sellerBearsFreight` drives the freight-responsibility
 *  default; the full legal meaning stays owner-reviewed. Additive — future codes may be appended. */
export interface IncotermDefinition {
  code: string;
  name: string;
  sellerBearsFreight: boolean;
  sellerBearsInsurance: boolean;
}

export const INCOTERMS: readonly IncotermDefinition[] = [
  { code: 'EXW', name: 'Ex Works', sellerBearsFreight: false, sellerBearsInsurance: false },
  { code: 'FCA', name: 'Free Carrier', sellerBearsFreight: false, sellerBearsInsurance: false },
  { code: 'FOB', name: 'Free On Board', sellerBearsFreight: false, sellerBearsInsurance: false },
  { code: 'CFR', name: 'Cost and Freight', sellerBearsFreight: true, sellerBearsInsurance: false },
  {
    code: 'CIF',
    name: 'Cost, Insurance & Freight',
    sellerBearsFreight: true,
    sellerBearsInsurance: true,
  },
  { code: 'DAP', name: 'Delivered At Place', sellerBearsFreight: true, sellerBearsInsurance: true },
] as const;

export const incotermCodes = INCOTERMS.map((i) => i.code) as [string, ...string[]];

/** Logistics node kinds (pack §10) — neutral across categories. */
export const logisticsNodeKinds = ['PORT', 'AIRPORT', 'INLAND_DEPOT', 'PICKUP_SITE'] as const;
export type LogisticsNodeKind = (typeof logisticsNodeKinds)[number];

/** Transport modes (configurable, not hardcoded per category). */
export const transportModes = [
  'SEA_FCL',
  'SEA_LCL',
  'RORO',
  'AIR',
  'ROAD',
  'RAIL',
  'COURIER',
  'BREAKBULK',
] as const;
export type TransportMode = (typeof transportModes)[number];

/** Who arranges + pays freight for a shipment (pack §10). */
export const freightArrangers = ['buyer', 'seller', 'singha'] as const;
export type FreightArranger = (typeof freightArrangers)[number];

/** A logistics quote's lifecycle. A quote is NOT a booking; it expires. */
export const quoteStatuses = ['ESTIMATE', 'QUOTED', 'EXPIRED', 'ACCEPTED'] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

/** Request an instant freight estimate for a leg. */
export const quoteRequestSchema = z.object({
  originNodeCode: z.string().min(1),
  destinationNodeCode: z.string().min(1),
  transportMode: z.enum(transportModes),
  incoterm: z.enum(incotermCodes),
  /** Chargeable weight/volume basis in whole units (kg or equivalent); drives the estimate. */
  chargeableUnits: z.number().int().positive(),
  currency: z.string().length(3),
  freightArranger: z.enum(freightArrangers).optional(),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

/** Shipment lifecycle states (Evolution E7b). */
export const shipmentStatuses = [
  'BOOKED',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof shipmentStatuses)[number];

/**
 * Append a shipment event. If `status` is set it advances the shipment (validated against the
 * lifecycle); otherwise it is an informational note on the timeline.
 */
export const shipmentEventSchema = z.object({
  type: z.string().min(1),
  status: z.enum(shipmentStatuses).optional(),
  note: z.string().optional(),
  locationCode: z.string().optional(),
});
export type ShipmentEventInput = z.infer<typeof shipmentEventSchema>;

/** A resolved quote — deterministic, with persisted assumptions + expiry (never a booking). */
export const quoteResultSchema = z.object({
  id: z.string(),
  status: z.enum(quoteStatuses),
  originNodeCode: z.string(),
  destinationNodeCode: z.string(),
  transportMode: z.enum(transportModes),
  incoterm: z.enum(incotermCodes),
  freightArranger: z.enum(freightArrangers),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  provider: z.string(),
  assumptions: z.record(z.unknown()),
  quotedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type QuoteResult = z.infer<typeof quoteResultSchema>;
