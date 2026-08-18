import { describe, expect, it } from 'vitest';
import { draftListingSchema } from '@singha/contracts';
import { MockAiProvider } from './ai.provider';

/**
 * Contract guard for POST /ai/listing-draft (directive §11). The frontend client
 * (`requestAiListingDraft`) sends `{ category, attributes, notes }` and reads back `draft:
 * { title, description, highlights, confidence }`. This test pins BOTH sides so the historical
 * FE↔BE drift (FE sent category/attributes/notes, BE demanded assetId → every call 400'd) can never
 * silently return.
 */
describe('ai/listing-draft request contract', () => {
  it('accepts the frontend payload shape (category + attributes + notes, no assetId)', () => {
    const parsed = draftListingSchema.safeParse({
      category: 'vehicles',
      attributes: { make: 'Toyota', model: 'Hilux', year: 2019 },
      notes: 'one owner, full service history',
    });
    expect(parsed.success).toBe(true);
  });

  it('still accepts a persisted-asset request (assetId only)', () => {
    expect(draftListingSchema.safeParse({ assetId: 'asset_123' }).success).toBe(true);
  });

  it('rejects a request with neither assetId nor category', () => {
    expect(draftListingSchema.safeParse({ notes: 'hi' }).success).toBe(false);
  });

  it('defaults locale to en', () => {
    const parsed = draftListingSchema.parse({ category: 'gems' });
    expect(parsed.locale).toBe('en');
  });
});

describe('ai/listing-draft response contract', () => {
  it('the provider returns exactly the shape the frontend AiListingDraft consumes', async () => {
    const draft = await new MockAiProvider().draftListing(
      'vehicles',
      { make: 'Toyota', model: 'Hilux', year: 2019 },
      'en',
    );
    expect(Object.keys(draft).sort()).toEqual(
      ['confidence', 'description', 'highlights', 'title'].sort(),
    );
    expect(typeof draft.title).toBe('string');
    expect(typeof draft.description).toBe('string');
    expect(Array.isArray(draft.highlights)).toBe(true);
    expect(typeof draft.confidence).toBe('number');
  });
});
