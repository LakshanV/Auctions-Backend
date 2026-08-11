import { describe, expect, it } from 'vitest';
import { IllegalTransition } from '../../kernel/errors';
import { EOI_REVIEW_DECISIONS, EOI_TERMINAL, assertEoiTransition, canTransitionEoi } from './eoi';

describe('EOI lifecycle', () => {
  it('allows the happy path submitted → negotiating → accepted', () => {
    expect(canTransitionEoi('submitted', 'under_review')).toBe(true);
    expect(canTransitionEoi('under_review', 'shortlisted')).toBe(true);
    expect(canTransitionEoi('shortlisted', 'negotiating')).toBe(true);
    expect(canTransitionEoi('negotiating', 'accepted')).toBe(true);
  });

  it('forbids illegal jumps', () => {
    expect(canTransitionEoi('submitted', 'accepted')).toBe(false);
    expect(() => assertEoiTransition('submitted', 'accepted')).toThrow(IllegalTransition);
  });

  it('treats terminal states as final', () => {
    for (const t of EOI_TERMINAL) {
      expect(canTransitionEoi(t, 'under_review')).toBe(false);
    }
  });

  it('maps every review decision to a legal-or-terminal status', () => {
    expect(EOI_REVIEW_DECISIONS.accept).toBe('accepted');
    expect(EOI_REVIEW_DECISIONS.decline).toBe('declined');
  });
});
