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
      { key: 'grade', label: 'Grade / specification', type: 'text', required: false },
      { key: 'packing', label: 'Packing type / size', type: 'text', required: false },
      { key: 'minOrderQuantity', label: 'Minimum order', type: 'number', required: false },
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
