import { describe, expect, it } from 'vitest';
import { assertId, isUlid, newId, type CustomerId } from './ids';

describe('ids', () => {
  it('mints valid, sortable ULIDs', () => {
    const a = newId<'CustomerId'>();
    const b = newId<'CustomerId'>();
    expect(isUlid(a)).toBe(true);
    expect(a).toHaveLength(26);
    expect(a).not.toEqual(b);
  });

  it('assertId brands a valid id and rejects malformed input', () => {
    const raw = newId<'CustomerId'>() as string;
    const branded: CustomerId = assertId<'CustomerId'>(raw);
    expect(branded).toEqual(raw);
    expect(() => assertId('not-a-ulid')).toThrow(/Invalid ULID/);
    // Lowercase / ambiguous characters are not valid Crockford base32.
    expect(isUlid('iiiiiiiiiiiiiiiiiiiiiiiiii')).toBe(false);
  });
});
