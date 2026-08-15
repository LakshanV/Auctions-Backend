import { z } from 'zod';
import { saleMethodValues } from './commands';

/**
 * Singha Evolution — configuration-domain contracts (E2). The canonical, versioned
 * taxonomy for sale methods and units lives here as typed constants so the DB seed,
 * the domain logic and any API/FE consumer share ONE source of truth (no drift). The
 * Prisma tables (`sale_method_definition`, `unit_definition`, `operator`, `market`,
 * `market_node`, `location`) persist this config; these schemas describe its shape.
 */

/* ---------------- Sale-method taxonomy (DECISIONS D3/D4) ---------------- */

export const saleMethodFamilies = ['auction', 'offer', 'fixed', 'eoi', 'procurement'] as const;
export type SaleMethodFamily = (typeof saleMethodFamilies)[number];

export const saleMethodDefinitionSchema = z
  .object({
    code: z.string().min(1),
    label: z.string().min(1),
    family: z.enum(saleMethodFamilies),
    /** True only for genuine auction mechanics (Timed/Live/Premier). */
    isAuction: z.boolean(),
    /**
     * Whether accepting/winning under this method creates a binding sale automatically.
     * MUST be false for every offer/sealed method (DECISIONS D4 — no silent auto-award;
     * a sealed offer's highest proposal never binds without explicit manual selection).
     */
    bindsAutomatically: z.boolean(),
    /** Whether enabling this method needs operator/jurisdiction eligibility (DECISIONS D7). */
    requiresEligibility: z.boolean(),
    /** Maps to the legacy `SaleMethod` enum value during migration, else null. */
    legacyEnum: z.enum(saleMethodValues).nullable(),
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  // Structural guards so a future edit can't silently break the non-negotiables:
  //  - D4: an offer/sealed method must never auto-bind (no silent auto-award of the highest).
  //  - consistency: `isAuction` is true iff the method is in the `auction` family.
  .superRefine((m, ctx) => {
    if (m.family === 'offer' && m.bindsAutomatically) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bindsAutomatically'],
        message: `offer method "${m.code}" must not bind automatically (DECISIONS D4)`,
      });
    }
    if (m.isAuction !== (m.family === 'auction')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isAuction'],
        message: `sale method "${m.code}": isAuction must equal (family === 'auction')`,
      });
    }
  });
export type SaleMethodDefinitionSpec = z.infer<typeof saleMethodDefinitionSchema>;

/** The canonical sale-method taxonomy. The six legacy enum values are active; the
 *  neutral offer/procurement methods are defined-but-inactive (ready for E4/E9). */
export const SALE_METHOD_DEFINITIONS: readonly SaleMethodDefinitionSpec[] = [
  {
    code: 'TIMED_AUCTION',
    label: 'Timed Auction',
    family: 'auction',
    isAuction: true,
    bindsAutomatically: true,
    requiresEligibility: true,
    legacyEnum: 'TIMED_AUCTION',
    active: true,
    sortOrder: 10,
  },
  {
    code: 'PREMIER_AUCTION',
    label: 'Premier Auction',
    family: 'auction',
    isAuction: true,
    bindsAutomatically: true,
    requiresEligibility: true,
    legacyEnum: null,
    active: false,
    sortOrder: 11,
  },
  {
    code: 'LIVE_HYBRID',
    label: 'Live / Hybrid Auction',
    family: 'auction',
    isAuction: true,
    bindsAutomatically: true,
    requiresEligibility: true,
    legacyEnum: 'LIVE_HYBRID',
    active: true,
    sortOrder: 15,
  },
  {
    code: 'BUY_NOW',
    label: 'Buy Now',
    family: 'fixed',
    isAuction: false,
    bindsAutomatically: true,
    requiresEligibility: false,
    legacyEnum: 'BUY_NOW',
    active: true,
    sortOrder: 20,
  },
  {
    code: 'CLASSIFIED',
    label: 'Classified',
    family: 'fixed',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: null,
    active: false,
    sortOrder: 21,
  },
  {
    code: 'MAKE_OFFER',
    label: 'Make Offer',
    family: 'offer',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: 'MAKE_OFFER',
    active: true,
    sortOrder: 30,
  },
  {
    code: 'NEGOTIATED_SALE',
    label: 'Negotiated Sale',
    family: 'offer',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: null,
    active: false,
    sortOrder: 31,
  },
  {
    code: 'PRIVATE_OFFER',
    label: 'Private Offer',
    family: 'offer',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: null,
    active: false,
    sortOrder: 32,
  },
  {
    code: 'FLASH_OFFER',
    label: 'Flash Offer',
    family: 'offer',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: null,
    active: false,
    sortOrder: 33,
  },
  {
    code: 'BEST_OFFER',
    label: 'Best Offer',
    family: 'offer',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: null,
    active: false,
    sortOrder: 34,
  },
  {
    code: 'EXPRESSION_OF_INTEREST',
    label: 'Expression of Interest',
    family: 'eoi',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: 'EXPRESSION_OF_INTEREST',
    active: true,
    sortOrder: 40,
  },
  {
    code: 'SEALED_TENDER',
    label: 'Sealed Tender',
    family: 'offer',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: 'SEALED_TENDER',
    active: true,
    sortOrder: 50,
  },
  {
    code: 'SEALED_OFFER',
    label: 'Sealed Offer',
    family: 'offer',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: null,
    active: false,
    sortOrder: 51,
  },
  {
    code: 'TENDER',
    label: 'Tender',
    family: 'procurement',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: null,
    active: false,
    sortOrder: 60,
  },
  {
    code: 'RFQ',
    label: 'Request for Quote',
    family: 'procurement',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: null,
    active: false,
    sortOrder: 61,
  },
  {
    code: 'REQUEST_SUPPLY',
    label: 'Request Supply',
    family: 'procurement',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: null,
    active: false,
    sortOrder: 62,
  },
  {
    code: 'REVERSE_TENDER',
    label: 'Reverse Tender',
    family: 'procurement',
    isAuction: false,
    bindsAutomatically: false,
    requiresEligibility: false,
    legacyEnum: null,
    active: false,
    sortOrder: 63,
  },
];

/* ---------------- Unit taxonomy (pack doc 13) ---------------- */

export const unitKinds = ['count', 'weight', 'volume', 'area', 'length'] as const;
export type UnitKind = (typeof unitKinds)[number];

export const unitDefinitionSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  plural: z.string().nullable(),
  kind: z.enum(unitKinds),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type UnitDefinitionSpec = z.infer<typeof unitDefinitionSchema>;

export const UNIT_DEFINITIONS: readonly UnitDefinitionSpec[] = [
  { code: 'each', label: 'Each', plural: 'Each', kind: 'count', active: true, sortOrder: 10 },
  { code: 'lot', label: 'Lot', plural: 'Lots', kind: 'count', active: true, sortOrder: 11 },
  { code: 'piece', label: 'Piece', plural: 'Pieces', kind: 'count', active: true, sortOrder: 12 },
  { code: 'unit', label: 'Unit', plural: 'Units', kind: 'count', active: true, sortOrder: 13 },
  {
    code: 'vehicle',
    label: 'Vehicle',
    plural: 'Vehicles',
    kind: 'count',
    active: true,
    sortOrder: 14,
  },
  {
    code: 'machine',
    label: 'Machine',
    plural: 'Machines',
    kind: 'count',
    active: true,
    sortOrder: 15,
  },
  {
    code: 'pallet',
    label: 'Pallet',
    plural: 'Pallets',
    kind: 'count',
    active: true,
    sortOrder: 16,
  },
  {
    code: 'container',
    label: 'Container',
    plural: 'Containers',
    kind: 'count',
    active: true,
    sortOrder: 17,
  },
  { code: 'bag', label: 'Bag', plural: 'Bags', kind: 'count', active: true, sortOrder: 18 },
  {
    code: 'bundle',
    label: 'Bundle',
    plural: 'Bundles',
    kind: 'count',
    active: true,
    sortOrder: 19,
  },
  {
    code: 'kg',
    label: 'Kilogram',
    plural: 'Kilograms',
    kind: 'weight',
    active: true,
    sortOrder: 30,
  },
  { code: 'g', label: 'Gram', plural: 'Grams', kind: 'weight', active: true, sortOrder: 31 },
  { code: 'tonne', label: 'Tonne', plural: 'Tonnes', kind: 'weight', active: true, sortOrder: 32 },
  { code: 'carat', label: 'Carat', plural: 'Carats', kind: 'weight', active: true, sortOrder: 33 },
  { code: 'litre', label: 'Litre', plural: 'Litres', kind: 'volume', active: true, sortOrder: 40 },
  {
    code: 'm3',
    label: 'Cubic metre',
    plural: 'Cubic metres',
    kind: 'volume',
    active: true,
    sortOrder: 41,
  },
  {
    code: 'm2',
    label: 'Square metre',
    plural: 'Square metres',
    kind: 'area',
    active: true,
    sortOrder: 50,
  },
  { code: 'acre', label: 'Acre', plural: 'Acres', kind: 'area', active: true, sortOrder: 51 },
  { code: 'perch', label: 'Perch', plural: 'Perches', kind: 'area', active: true, sortOrder: 52 },
];

/* ---------------- Operator / Market / Node config (mirror Prisma enums) ---------------- */

export const operatorTypes = [
  'company',
  'subsidiary',
  'sister_company',
  'trading_business',
  'custodian',
  'agent',
  'representative',
  'marketplace_operator',
  'local_service_company',
] as const;
export type OperatorType = (typeof operatorTypes)[number];

/** Owner/legal config verification (DECISIONS D7). Binding paths on `draft`/`unverified`
 *  config must return MANUAL_REVIEW_REQUIRED. */
export const configVerificationStates = ['draft', 'unverified', 'verified'] as const;
export type ConfigVerification = (typeof configVerificationStates)[number];

/** Satellite Market Node mode (Addendum A). */
export const marketNodeModes = ['DISCOVERY', 'LOCAL_COMMERCE'] as const;
export type MarketNodeMode = (typeof marketNodeModes)[number];

export const marketNodeCapabilitySchema = z.object({
  canOriginateListings: z.boolean(),
  canTakeOffers: z.boolean(),
  canRunAuctions: z.boolean(),
  canAcceptPayments: z.boolean(),
});
export type MarketNodeCapabilities = z.infer<typeof marketNodeCapabilitySchema>;
