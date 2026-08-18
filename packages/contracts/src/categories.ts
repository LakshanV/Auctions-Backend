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
  // §1 — scrap / metals / materials is a distinct asset class with its own specialist fields
  // (material, grade, contamination, sorted status, loading/weighbridge basis). `Asset.category`
  // is a String column validated against this list, so adding a key is additive (no migration).
  'scrap',
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

// §1 — produce / agricultural commodities. All new fields are OPTIONAL (additive rule: no version
// bump; existing bulk assets keep validating). AI may observe quality clues but never grades lab
// quality (directive §1) — the grade/quality fields are seller declarations or evidence-backed.
const bulkV1 = z.object({
  itemType: z.string().min(1),
  quantity: z.number().int().positive(),
  unit: z.string().min(1),
  grade: z.string().optional(),
  packing: z.string().optional(),
  minOrderQuantity: z.number().nonnegative().optional(),
  variety: z.string().optional(),
  origin: z.string().optional(),
  packSize: z.string().optional(),
  harvestDate: z.string().optional(),
  availableDate: z.string().optional(),
  shelfLifeDays: z.number().int().nonnegative().optional(),
  storageRequirement: z.string().optional(),
  coldChainRequired: z.boolean().optional(),
  qualityNotes: z.string().optional(),
  recurringSupply: z.boolean().optional(),
  deliveryFrequency: z.string().optional(),
});

// §1 — scrap / metals / materials. First field required; the rest optional + additive.
const scrapV1 = z.object({
  material: z.string().min(1),
  materialCategory: z.enum(['ferrous', 'non_ferrous', 'mixed', 'other']).optional(),
  gradeSpec: z.string().optional(),
  quantity: z.number().nonnegative().optional(),
  unit: z.string().optional(),
  contamination: z.string().optional(),
  sortedStatus: z.enum(['sorted', 'mixed', 'unsorted']).optional(),
  recoveryCondition: z.string().optional(),
  loadingAvailable: z.boolean().optional(),
  loadingMethod: z.string().optional(),
  weighbridgeBasis: z.string().optional(),
  collectionRequirements: z.string().optional(),
  condition: z.string().optional(),
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
  scrap: { key: 'scrap', version: 1, schema: scrapV1 },
  general: { key: 'general', version: 1, schema: generalV1 },
};

export function isCategoryKey(value: string): value is CategoryKey {
  return (CATEGORY_KEYS as readonly string[]).includes(value);
}

export const CURRENT_CATEGORY_VERSION = 1;

/**
 * §3 — customer-facing subcategory taxonomy: `Category → Subcategory[]`, CONFIG (not DB enums, per
 * the directive) and versioned so it evolves without migrations. The chosen subcategory is stored on
 * `Asset.subcategory` (a nullable String) and drives seller selection, catalogue browsing/facets,
 * search and AI mapping. Values are stable slugs; labels are display copy. Adding/removing entries is
 * additive — an asset whose subcategory is later retired still resolves (the slug is preserved).
 */
export const SUBCATEGORY_VERSION = 1;

export const CATEGORY_SUBCATEGORIES: Record<CategoryKey, { value: string; label: string }[]> = {
  vehicles: [
    { value: 'cars', label: 'Cars' },
    { value: 'suv_4x4', label: 'SUVs / 4x4' },
    { value: 'commercial_vehicles', label: 'Commercial vehicles' },
    { value: 'trucks', label: 'Trucks' },
    { value: 'buses', label: 'Buses' },
    { value: 'motorcycles', label: 'Motorcycles' },
    { value: 'salvage_vehicles', label: 'Salvage vehicles' },
    { value: 'fleet_disposals', label: 'Fleet disposals' },
    { value: 'parts_dismantling', label: 'Parts / dismantling' },
  ],
  machinery: [
    { value: 'excavators', label: 'Excavators' },
    { value: 'loaders', label: 'Loaders' },
    { value: 'forklifts', label: 'Forklifts' },
    { value: 'backhoe_loaders', label: 'Backhoe loaders' },
    { value: 'agricultural_machinery', label: 'Agricultural machinery' },
    { value: 'tractors', label: 'Tractors' },
    { value: 'generators', label: 'Generators' },
    { value: 'compressors', label: 'Compressors' },
    { value: 'industrial_machinery', label: 'Industrial machinery' },
    { value: 'construction_equipment', label: 'Construction equipment' },
  ],
  gems: [
    { value: 'sapphire', label: 'Sapphire' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'spinel', label: 'Spinel' },
    { value: 'tourmaline', label: 'Tourmaline' },
    { value: 'other_coloured', label: 'Other coloured gemstones' },
    { value: 'jewellery', label: 'Jewellery' },
    { value: 'gem_parcels', label: 'Gem parcels / lots' },
    { value: 'certified_gems', label: 'Certified gems' },
  ],
  property: [
    { value: 'land', label: 'Land' },
    { value: 'residential', label: 'Residential' },
    { value: 'commercial', label: 'Commercial' },
    { value: 'industrial', label: 'Industrial' },
    { value: 'agricultural', label: 'Agricultural' },
    { value: 'warehouses', label: 'Warehouses' },
    { value: 'development', label: 'Development property' },
  ],
  bulk: [
    { value: 'vegetables', label: 'Vegetables' },
    { value: 'fruit', label: 'Fruit' },
    { value: 'grains', label: 'Grains' },
    { value: 'pulses', label: 'Pulses' },
    { value: 'spices', label: 'Spices' },
    { value: 'tea', label: 'Tea' },
    { value: 'coconut_products', label: 'Coconut products' },
    { value: 'other_agricultural', label: 'Other agricultural commodities' },
  ],
  scrap: [
    { value: 'ferrous', label: 'Ferrous' },
    { value: 'aluminium', label: 'Aluminium' },
    { value: 'copper', label: 'Copper' },
    { value: 'stainless', label: 'Stainless' },
    { value: 'automotive_scrap', label: 'Automotive scrap' },
    { value: 'industrial_surplus', label: 'Industrial surplus' },
    { value: 'reusable_structural', label: 'Reusable structural material' },
    { value: 'other_materials', label: 'Other materials' },
  ],
  general: [],
};

/** True when `subcategory` is a known subcategory of `category` (empty/unknown → false). */
export function isSubcategoryOf(category: string, subcategory: string): boolean {
  if (!isCategoryKey(category)) return false;
  return CATEGORY_SUBCATEGORIES[category].some((s) => s.value === subcategory);
}

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
