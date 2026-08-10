import { describe, expect, it } from 'vitest';
import { assertListingTransition, canTransitionListing } from './lifecycle';
import { IllegalTransition } from '../../kernel/errors';

describe('listing lifecycle', () => {
  it('permits the happy-path review + publish moves', () => {
    expect(canTransitionListing('draft', 'submitted')).toBe(true);
    expect(canTransitionListing('submitted', 'approved')).toBe(true);
    expect(canTransitionListing('approved', 'scheduled')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransitionListing('draft', 'approved')).toBe(false);
    expect(canTransitionListing('sold', 'draft')).toBe(false);
    expect(() => assertListingTransition('draft', 'live')).toThrow(IllegalTransition);
  });
});
