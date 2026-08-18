import { type CategoryKey, CURRENT_CATEGORY_VERSION } from './categories';

/**
 * Customer-safe category field descriptors (directive §2/§3). The authoritative validator remains
 * the versioned Zod `CATEGORY_SCHEMAS` in `categories.ts`; this is the *presentation* contract the
 * seller UI consumes to render a dynamic form (no hard-coded field map on the frontend). A sync test
 * (`category-fields.test.ts`) asserts these descriptors never drift from the Zod shape: every
 * descriptor key exists in the schema, and every required (non-optional) Zod key is required here.
 *
 * `type` maps to an input control; `options` provides enum choices; `unit` is a display suffix;
 * `required` mirrors the Zod requiredness. Adding a field means adding it OPTIONAL in both places
 * (same version) so old assets stay valid.
 */
export type CategoryFieldType = 'text' | 'number' | 'select' | 'boolean';

export interface CategoryFieldOption {
  value: string;
  label: string;
}

export interface CategoryFieldDescriptor {
  key: string;
  label: string;
  type: CategoryFieldType;
  required: boolean;
  unit?: string;
  options?: CategoryFieldOption[];
  min?: number;
  max?: number;
  help?: string;
}

export interface CategoryFieldSchema {
  key: CategoryKey;
  version: number;
  label: string;
  fields: CategoryFieldDescriptor[];
  // §3 — the category's customer-facing subcategories, served alongside the fields so the seller UI
  // can render a subcategory selector without a hard-coded map. Populated from CATEGORY_SUBCATEGORIES
  // by the platform-config service; optional here so the descriptor literal stays fields-focused.
  subcategories?: CategoryFieldOption[];
}

const opt = (...values: string[]): CategoryFieldOption[] =>
  values.map((v) => ({
    value: v,
    label: v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' '),
  }));

export const CATEGORY_FIELD_SCHEMAS: Record<CategoryKey, CategoryFieldSchema> = {
  vehicles: {
    key: 'vehicles',
    version: CURRENT_CATEGORY_VERSION,
    label: 'Vehicles',
    fields: [
      { key: 'make', label: 'Make', type: 'text', required: true },
      { key: 'model', label: 'Model', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'number', required: true, min: 1900, max: 2100 },
      { key: 'variant', label: 'Variant / grade', type: 'text', required: false },
      { key: 'mileageKm', label: 'Mileage', type: 'number', required: false, unit: 'km' },
      {
        key: 'fuel',
        label: 'Fuel',
        type: 'select',
        required: false,
        options: opt('petrol', 'diesel', 'hybrid', 'electric', 'other'),
      },
      {
        key: 'transmission',
        label: 'Transmission',
        type: 'select',
        required: false,
        options: opt('manual', 'automatic', 'other'),
      },
      { key: 'bodyType', label: 'Body type', type: 'text', required: false },
      {
        key: 'registration',
        label: 'Registration status',
        type: 'text',
        required: false,
        help: 'Registered / unregistered / on-paper — no full plate needed',
      },
      { key: 'damageNotes', label: 'Damage / condition notes', type: 'text', required: false },
      { key: 'keysPresent', label: 'Keys present', type: 'boolean', required: false },
      { key: 'runsAndDrives', label: 'Runs & drives', type: 'boolean', required: false },
    ],
  },
  machinery: {
    key: 'machinery',
    version: CURRENT_CATEGORY_VERSION,
    label: 'Machinery & equipment',
    fields: [
      { key: 'make', label: 'Make', type: 'text', required: true },
      { key: 'model', label: 'Model', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'number', required: false, min: 1900, max: 2100 },
      { key: 'hoursUsed', label: 'Hours used', type: 'number', required: false, unit: 'hrs' },
      { key: 'attachments', label: 'Attachments', type: 'text', required: false },
      { key: 'serialNumber', label: 'Serial number', type: 'text', required: false },
      { key: 'operational', label: 'Operational', type: 'boolean', required: false },
      {
        key: 'condition',
        label: 'Condition',
        type: 'select',
        required: false,
        options: opt('new', 'used', 'refurbished', 'for_parts'),
      },
    ],
  },
  gems: {
    key: 'gems',
    version: CURRENT_CATEGORY_VERSION,
    label: 'Gems & jewellery',
    fields: [
      { key: 'type', label: 'Gem type', type: 'text', required: true },
      { key: 'caratWeight', label: 'Weight', type: 'number', required: true, unit: 'ct' },
      { key: 'colour', label: 'Colour', type: 'text', required: false },
      { key: 'clarity', label: 'Clarity', type: 'text', required: false },
      { key: 'shape', label: 'Shape / cut', type: 'text', required: false },
      { key: 'dimensionsMm', label: 'Dimensions', type: 'text', required: false, unit: 'mm' },
      { key: 'origin', label: 'Origin', type: 'text', required: false },
      {
        key: 'certified',
        label: 'Certified',
        type: 'boolean',
        required: false,
        help: 'A photo is never lab certification — attach a verified certificate reference below',
      },
      { key: 'certificateRef', label: 'Certificate reference', type: 'text', required: false },
      {
        key: 'treatment',
        label: 'Treatment',
        type: 'text',
        required: false,
        help: 'Only where backed by evidence or a declaration',
      },
    ],
  },
  property: {
    key: 'property',
    version: CURRENT_CATEGORY_VERSION,
    label: 'Property & land',
    fields: [
      {
        key: 'propertyType',
        label: 'Property type',
        type: 'select',
        required: true,
        options: opt('land', 'residential', 'commercial', 'industrial', 'agricultural'),
      },
      { key: 'extentPerches', label: 'Extent', type: 'number', required: false, unit: 'perches' },
      { key: 'district', label: 'District', type: 'text', required: false },
      { key: 'address', label: 'Address', type: 'text', required: false },
      { key: 'access', label: 'Access / road frontage', type: 'text', required: false },
    ],
  },
  bulk: {
    key: 'bulk',
    version: CURRENT_CATEGORY_VERSION,
    label: 'Produce & bulk commodities',
    fields: [
      { key: 'itemType', label: 'Commodity / item type', type: 'text', required: true },
      { key: 'quantity', label: 'Quantity available', type: 'number', required: true },
      {
        key: 'unit',
        label: 'Unit',
        type: 'text',
        required: true,
        help: 'e.g. kg, tonne, unit, crate',
      },
      { key: 'variety', label: 'Variety', type: 'text', required: false },
      { key: 'grade', label: 'Grade / specification', type: 'text', required: false },
      { key: 'origin', label: 'Origin', type: 'text', required: false },
      { key: 'packing', label: 'Packing type', type: 'text', required: false },
      { key: 'packSize', label: 'Pack size', type: 'text', required: false },
      { key: 'minOrderQuantity', label: 'Minimum order', type: 'number', required: false },
      { key: 'harvestDate', label: 'Harvest date', type: 'text', required: false },
      { key: 'availableDate', label: 'Available from', type: 'text', required: false },
      { key: 'shelfLifeDays', label: 'Shelf life', type: 'number', required: false, unit: 'days' },
      { key: 'storageRequirement', label: 'Storage requirement', type: 'text', required: false },
      {
        key: 'coldChainRequired',
        label: 'Cold-chain required',
        type: 'boolean',
        required: false,
      },
      {
        key: 'qualityNotes',
        label: 'Quality notes',
        type: 'text',
        required: false,
        help: 'Seller declaration — photos never grade lab quality',
      },
      {
        key: 'recurringSupply',
        label: 'Recurring supply available',
        type: 'boolean',
        required: false,
      },
      { key: 'deliveryFrequency', label: 'Delivery frequency', type: 'text', required: false },
    ],
  },
  scrap: {
    key: 'scrap',
    version: CURRENT_CATEGORY_VERSION,
    label: 'Scrap & materials',
    fields: [
      { key: 'material', label: 'Material', type: 'text', required: true },
      {
        key: 'materialCategory',
        label: 'Material category',
        type: 'select',
        required: false,
        options: opt('ferrous', 'non_ferrous', 'mixed', 'other'),
      },
      { key: 'gradeSpec', label: 'Grade / specification', type: 'text', required: false },
      { key: 'quantity', label: 'Quantity available', type: 'number', required: false },
      { key: 'unit', label: 'Unit', type: 'text', required: false, help: 'e.g. tonne, kg' },
      { key: 'contamination', label: 'Contamination', type: 'text', required: false },
      {
        key: 'sortedStatus',
        label: 'Sorted status',
        type: 'select',
        required: false,
        options: opt('sorted', 'mixed', 'unsorted'),
      },
      {
        key: 'recoveryCondition',
        label: 'Reusable / recovery condition',
        type: 'text',
        required: false,
      },
      { key: 'loadingAvailable', label: 'Loading available', type: 'boolean', required: false },
      { key: 'loadingMethod', label: 'Loading method', type: 'text', required: false },
      { key: 'weighbridgeBasis', label: 'Weighbridge basis', type: 'text', required: false },
      {
        key: 'collectionRequirements',
        label: 'Collection requirements',
        type: 'text',
        required: false,
      },
      { key: 'condition', label: 'Condition notes', type: 'text', required: false },
    ],
  },
  general: {
    key: 'general',
    version: CURRENT_CATEGORY_VERSION,
    label: 'General assets',
    fields: [
      { key: 'description', label: 'Description', type: 'text', required: false },
      {
        key: 'condition',
        label: 'Condition',
        type: 'select',
        required: false,
        options: opt('new', 'used', 'refurbished', 'for_parts', 'salvage'),
      },
    ],
  },
};
