import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { CATEGORY_KEYS, CATEGORY_SCHEMAS } from './categories';
import { CATEGORY_FIELD_SCHEMAS } from './category-fields';

/**
 * The customer-safe field descriptors are a *presentation* mirror of the authoritative Zod
 * `CATEGORY_SCHEMAS`. This guard fails the build if they drift — a descriptor for a field the
 * schema doesn't have, a schema field with no descriptor, or a requiredness mismatch — so the
 * seller UI can never render a field the server won't accept (or miss a required one).
 */
describe('category field descriptors stay in sync with the Zod category schemas', () => {
  for (const key of CATEGORY_KEYS) {
    it(`${key}: descriptor keys + requiredness match the Zod schema`, () => {
      const fieldSchema = CATEGORY_FIELD_SCHEMAS[key];
      expect(fieldSchema, `missing field schema for ${key}`).toBeDefined();
      expect(fieldSchema.version).toBe(CATEGORY_SCHEMAS[key].version);

      const shape = (CATEGORY_SCHEMAS[key].schema as z.ZodObject<z.ZodRawShape>).shape;
      const zKeys = Object.keys(shape).sort();
      const dKeys = fieldSchema.fields.map((f) => f.key).sort();
      expect(dKeys).toEqual(zKeys);

      for (const f of fieldSchema.fields) {
        const zfield = shape[f.key]!;
        expect(f.required, `${key}.${f.key} requiredness`).toBe(!zfield.isOptional());
        if (f.type === 'select') {
          expect(f.options?.length ?? 0, `${key}.${f.key} needs options`).toBeGreaterThan(0);
        }
      }
    });
  }
});
