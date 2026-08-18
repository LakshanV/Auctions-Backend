import { z } from 'zod';

/**
 * Versioned category schemas (docs/04, docs/06). Category-specific attributes are
 * validated against a versioned Zod schema so new fields never break old assets:
 * each Asset stores its category `schemaVersion`, and adding a field means adding
 * a new version — existing rows keep validating against the version they were
 * created with. Categories are extensible without core-schema rewrites.
 */
export const CATEGORY_KEYS = [
  'vehicles',
  'machinery',
  'gems',
  'property',
  'bulk',
  'general',
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

// Additive rule: new fields are added OPTIONAL so existing assets (which lack them) keep validating
// against version 1 — no destructive change, no version bump (directive §4 "version all category
// evolution so old assets remain valid"). Making a field required later needs a new version.
const vehiclesV1 = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  variant: z.string().optional(),
  mileageKm: z.number().int().nonnegative().optional(),
  fuel: z.enum(['petrol', 'diesel', 'hybrid', 'electric', 'other']).optional(),
  transmission: z.enum(['manual', 'automatic', 'other']).optional(),
  bodyType: z.string().optional(),
  registration: z.string().optional(),
  damageNotes: z.string().optional(),
  keysPresent: z.boolean().optional(),
  runsAndDrives: z.boolean().optional(),
});

const machineryV1 = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1900).max(2100).optional(),
  hoursUsed: z.number().int().nonnegative().optional(),
  attachments: z.string().optional(),
  serialNumber: z.string().optional(),
  operational: z.boolean().optional(),
  condition: z.enum(['new', 'used', 'refurbished', 'for_parts']).optional(),
});

const gemsV1 = z.object({
  type: z.string().min(1),
  caratWeight: z.number().positive(),
  colour: z.string().optional(),
  clarity: z.string().optional(),
  shape: z.string().optional(),
  dimensionsMm: z.string().optional(),
  origin: z.string().optional(),
  certified: z.boolean().optional(),
  certificateRef: z.string().optional(),
  treatment: z.string().optional(),
});

const propertyV1 = z.object({
  propertyType: z.enum(['land', 'residential', 'commercial', 'industrial', 'agricultural']),
  extentPerches: z.number().positive().optional(),
  district: z.string().optional(),
  address: z.string().optional(),
  access: z.string().optional(),
});

const bulkV1 = z.object({
  itemType: z.string().min(1),
  quantity: z.number().int().positive(),
  unit: z.string().min(1),
  grade: z.string().optional(),
  packing: z.string().optional(),
  minOrderQuantity: z.number().nonnegative().optional(),
});

const generalV1 = z.object({
  description: z.string().optional(),
  condition: z.enum(['new', 'used', 'refurbished', 'for_parts', 'salvage']).optional(),
});

export interface CategorySchema {
  key: CategoryKey;
  version: number;
  schema: z.ZodType;
}

export const CATEGORY_SCHEMAS: Record<CategoryKey, CategorySchema> = {
  vehicles: { key: 'vehicles', version: 1, schema: vehiclesV1 },
  machinery: { key: 'machinery', version: 1, schema: machineryV1 },
  gems: { key: 'gems', version: 1, schema: gemsV1 },
  property: { key: 'property', version: 1, schema: propertyV1 },
  bulk: { key: 'bulk', version: 1, schema: bulkV1 },
  general: { key: 'general', version: 1, schema: generalV1 },
};

export function isCategoryKey(value: string): value is CategoryKey {
  return (CATEGORY_KEYS as readonly string[]).includes(value);
}

export const CURRENT_CATEGORY_VERSION = 1;

export interface CategoryValidationResult {
  success: boolean;
  data?: Record<string, unknown>;
  errors?: string[];
}

/** Validate category-specific attributes against the current schema version. */
export function validateAssetAttributes(
  key: CategoryKey,
  attributes: unknown,
): CategoryValidationResult {
  const def = CATEGORY_SCHEMAS[key];
  const parsed = def.schema.safeParse(attributes);
  if (parsed.success) {
    return { success: true, data: parsed.data as Record<string, unknown> };
  }
  return {
    success: false,
    errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
