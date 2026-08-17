import { describe, expect, it } from 'vitest';
import { interpretSearchQuery } from './ai.search-interpreter';

describe('interpretSearchQuery (AIC-3 — deterministic "LLM interprets" seam)', () => {
  it('the task-pack example: "toyota in melbourne ending soon" -> location + endingSoon + a search term', () => {
    const { filters, confidence } = interpretSearchQuery('toyota in melbourne ending soon');

    expect(filters.location).toBe('Melbourne');
    expect(filters.endingSoon).toBe(true);
    expect(filters.search).toBe('toyota');
    // Never returns inventory/results — only ever these structured-filter keys.
    expect(Object.keys(filters).sort()).toEqual(['endingSoon', 'location', 'search'].sort());
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(0.9);
  });

  it('is deterministic — the exact same input always produces the exact same output (no randomness)', () => {
    const a = interpretSearchQuery('gems in kandy under 500000');
    const b = interpretSearchQuery('gems in kandy under 500000');
    expect(a).toEqual(b);
  });

  it('maps category words to the catalogue CategoryKey', () => {
    expect(interpretSearchQuery('cars for sale').filters.category).toBe('vehicles');
    expect(interpretSearchQuery('machinery available').filters.category).toBe('machinery');
    expect(interpretSearchQuery('sapphire ring').filters.category).toBe('gems');
    expect(interpretSearchQuery('land in galle').filters.category).toBe('property');
    expect(interpretSearchQuery('wholesale pallets').filters.category).toBe('bulk');
  });

  it('does not misfile "Land Cruiser" / "Land Rover" vehicles under property (the "land" collision)', () => {
    // Regression: the bare word "land" is a `property` keyword, so "toyota land cruiser prado"
    // was read as {category:'property', search:'toyota cruiser prado'} and returned ZERO results
    // for one of the market's most-searched vehicles. The compound name must pin `vehicles` and,
    // crucially, "land cruiser" must survive in `search` so the catalogue substring-matches it.
    const lc = interpretSearchQuery('toyota land cruiser prado');
    expect(lc.filters.category).toBe('vehicles');
    expect(lc.filters.search).toContain('land cruiser');

    expect(interpretSearchQuery('land rover defender').filters.category).toBe('vehicles');
    expect(interpretSearchQuery('range rover sport').filters.category).toBe('vehicles');

    // A genuine land/property search (no vehicle compound) is unaffected — still `property`.
    expect(interpretSearchQuery('beachfront land in galle').filters.category).toBe('property');
    expect(interpretSearchQuery('agricultural land').filters.category).toBe('property');
  });

  it('maps sale-method words/phrases to saleMethodValues, preferring the more specific phrase', () => {
    expect(interpretSearchQuery('any timed auction').filters.saleMethod).toBe('TIMED_AUCTION');
    expect(interpretSearchQuery('buy now items').filters.saleMethod).toBe('BUY_NOW');
    expect(interpretSearchQuery('make an offer').filters.saleMethod).toBe('MAKE_OFFER');
    expect(interpretSearchQuery('sealed tender lots').filters.saleMethod).toBe('SEALED_TENDER');
    expect(interpretSearchQuery('expression of interest').filters.saleMethod).toBe(
      'EXPRESSION_OF_INTEREST',
    );
    // "live auction" must resolve to LIVE_HYBRID, not the generic TIMED_AUCTION "auction" match.
    expect(interpretSearchQuery('live auction cars').filters.saleMethod).toBe('LIVE_HYBRID');
  });

  it('never turns a price bound into a filter (the catalogue has no server-side price filter) and never leaks it into `search`', () => {
    // "toyota" is a deliberate extra salient word so `search` is non-empty here — otherwise the
    // "never leaks into search" assertions below would pass vacuously on an undefined field.
    const under = interpretSearchQuery('toyota vehicles under 500000 in colombo');
    expect(under.filters.category).toBe('vehicles');
    expect(under.filters.location).toBe('Colombo');
    expect(under.filters).not.toHaveProperty('priceMax');
    expect(under.filters).not.toHaveProperty('minPrice');
    expect(under.filters.search).toBe('toyota');
    expect(under.filters.search).not.toMatch(/\d/);
    expect(under.filters.search).not.toContain('under');

    const over = interpretSearchQuery('rare gems over rs. 1,200,000');
    expect(over.filters.category).toBe('gems');
    expect(over.filters.search).toBe('rare');
    expect(over.filters.search).not.toMatch(/\d/);
  });

  it('strips a trailing magnitude word so "under 10 million" cannot leak "million" into search', () => {
    // Regression: "under 10" was stripped but the magnitude word survived as a phantom search
    // token ("toyota million"), which matched nothing even though "toyota" matches many lots.
    const a = interpretSearchQuery('toyota car under 10 million');
    expect(a.filters.category).toBe('vehicles');
    expect(a.filters.search).toBe('toyota');
    expect(a.filters.search).not.toMatch(/million|\d/);

    for (const q of [
      'excavators under 500k',
      'land below 2 crore',
      'gems over rs 5 lakhs',
      'vans less than 3.5m',
    ]) {
      const { filters } = interpretSearchQuery(q);
      expect(filters.search ?? '').not.toMatch(
        /\b(k|m|mn|bn|thousand|million|billion|lakhs?|crores?)\b|\d/,
      );
    }
  });

  it('recognizes "closing"/"ending" alone (not just "ending soon") as endingSoon', () => {
    expect(interpretSearchQuery('lots closing').filters.endingSoon).toBe(true);
    expect(interpretSearchQuery('auctions ending').filters.endingSoon).toBe(true);
  });

  it('leftover salient words become the free-text search term, joined and capped at 120 chars', () => {
    const { filters } = interpretSearchQuery('vintage rolex submariner');
    expect(filters.category).toBeUndefined();
    expect(filters.search).toBe('vintage rolex submariner');
  });

  it('common stopwords never end up in the search term', () => {
    const { filters } = interpretSearchQuery('please show me a toyota');
    expect(filters.search).toBe('toyota');
  });

  it('an input recognized as nothing at all (pure stopwords) returns fully empty filters and the lowest confidence', () => {
    const { filters, confidence } = interpretSearchQuery('the a an');
    expect(filters).toEqual({});
    expect(confidence).toBeCloseTo(0.3, 5);
  });

  it('more recognized fields yields higher confidence than fewer', () => {
    const rich = interpretSearchQuery('toyota vehicles in melbourne ending soon');
    const sparse = interpretSearchQuery('melbourne');
    expect(rich.confidence).toBeGreaterThan(sparse.confidence);
  });

  // --- Marketplace stress: noise-word stripping + fulfilment facets + synonyms ---------------
  it('strips measurement/unit noise so intent words survive the free-text term', () => {
    // "carats" is an attribute, not a full-text token; leaving it in over-constrains to zero.
    const { filters } = interpretSearchQuery('blue sapphires over 5 carats');
    expect(filters.category).toBe('gems');
    expect(filters.search).toBe('blue');
  });

  it('maps "delivery/delivered" and "pickup/collection" intent onto the RW4 facets', () => {
    expect(interpretSearchQuery('machinery with delivery available').filters.delivery).toBe(true);
    expect(interpretSearchQuery('items for pickup only').filters.pickup).toBe(true);
    // the fulfilment word never survives as a phantom search token
    const f = interpretSearchQuery('toyota delivery').filters;
    expect(f.delivery).toBe(true);
    expect(f.search ?? '').not.toMatch(/deliver/);
  });

  it('normalises condition synonyms to the corpus vocabulary (damaged -> damage)', () => {
    const { filters } = interpretSearchQuery('damaged vehicles in Colombo');
    expect(filters.category).toBe('vehicles');
    expect(filters.location).toBe('Colombo');
    expect(filters.search).toBe('damage');
  });

  it('treats "delivered to <place>" as a destination (delivery facet), never an item-location filter', () => {
    const { filters } = interpretSearchQuery('20 tonnes of onions delivered to Colombo');
    expect(filters.delivery).toBe(true);
    expect(filters.location).toBeUndefined(); // Colombo is the destination, not where the onions are
    expect(filters.search).toBe('onions');
  });

  it('drops vague qualifiers and standalone numbers from the search term', () => {
    const { filters } = interpretSearchQuery('cheapest machine with delivery available');
    expect(filters.category).toBe('machinery');
    expect(filters.delivery).toBe(true);
    expect(filters.search).toBeUndefined();
  });
});
