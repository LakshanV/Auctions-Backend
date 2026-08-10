import { describe, expect, it } from 'vitest';
import { isCategoryKey, validateAssetAttributes } from './categories';

describe('category schemas', () => {
  it('accepts valid category-specific attributes', () => {
    const result = validateAssetAttributes('vehicles', {
      make: 'Toyota',
      model: 'Prado',
      year: 2019,
      mileageKm: 84000,
      fuel: 'diesel',
    });
    expect(result.success).toBe(true);
    expect(result.data?.make).toBe('Toyota');
  });

  it('rejects attributes that violate the schema', () => {
    const result = validateAssetAttributes('vehicles', { make: 'Toyota' });
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes('model'))).toBe(true);
  });

  it('validates gems carat weight as positive', () => {
    expect(validateAssetAttributes('gems', { type: 'sapphire', caratWeight: 4.2 }).success).toBe(
      true,
    );
    expect(validateAssetAttributes('gems', { type: 'sapphire', caratWeight: -1 }).success).toBe(
      false,
    );
  });

  it('knows its category keys', () => {
    expect(isCategoryKey('property')).toBe(true);
    expect(isCategoryKey('spaceships')).toBe(false);
  });
});
