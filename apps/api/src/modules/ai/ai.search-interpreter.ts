import type { CatalogueQuery, CategoryKey } from '@singha/contracts';

/**
 * AIC-3 — AI-assisted search, the "LLM interprets" seam (docs/10 "Customer AI" search/
 * discovery). This is a DETERMINISTIC, pure, keyword-based stand-in for a real model: no
 * randomness, no network, no DB, fully unit-testable in isolation. It NEVER returns inventory,
 * prices, availability or ranked results — only a best-guess STRUCTURED filter object. The
 * caller (`AssistantService.search`) re-validates every field against the SAME
 * `catalogueQuerySchema` the public catalogue itself enforces, and only `CatalogueV2Service` —
 * the ONE authoritative executor — ever queries the database (the one architectural rule for
 * this ticket). Swapping this for a real model later means replacing only this file's body (or
 * `MockAiProvider.interpretSearch`'s delegate) — the seam/shape on `AiProvider` stays fixed.
 */
export interface SearchInterpretation {
  filters: Partial<CatalogueQuery>;
  confidence: number;
}

type SaleMethod = NonNullable<CatalogueQuery['saleMethod']>;

/** category words -> the catalogue's own CategoryKey (docs/06). */
const CATEGORY_KEYWORDS: Record<string, CategoryKey> = {
  vehicle: 'vehicles',
  vehicles: 'vehicles',
  car: 'vehicles',
  cars: 'vehicles',
  van: 'vehicles',
  vans: 'vehicles',
  truck: 'vehicles',
  trucks: 'vehicles',
  suv: 'vehicles',
  suvs: 'vehicles',
  motorbike: 'vehicles',
  motorbikes: 'vehicles',
  motorcycle: 'vehicles',
  motorcycles: 'vehicles',
  auto: 'vehicles',
  automobile: 'vehicles',
  automobiles: 'vehicles',
  machinery: 'machinery',
  machine: 'machinery',
  machines: 'machinery',
  excavator: 'machinery',
  excavators: 'machinery',
  forklift: 'machinery',
  forklifts: 'machinery',
  tractor: 'machinery',
  tractors: 'machinery',
  generator: 'machinery',
  generators: 'machinery',
  equipment: 'machinery',
  gem: 'gems',
  gems: 'gems',
  gemstone: 'gems',
  gemstones: 'gems',
  jewellery: 'gems',
  jewelry: 'gems',
  sapphire: 'gems',
  sapphires: 'gems',
  ruby: 'gems',
  rubies: 'gems',
  diamond: 'gems',
  diamonds: 'gems',
  property: 'property',
  properties: 'property',
  land: 'property',
  house: 'property',
  houses: 'property',
  apartment: 'property',
  apartments: 'property',
  villa: 'property',
  villas: 'property',
  bulk: 'bulk',
  wholesale: 'bulk',
  pallet: 'bulk',
  pallets: 'bulk',
  general: 'general',
  misc: 'general',
  miscellaneous: 'general',
};

/**
 * Ambiguous product-name phrases whose HEAD word collides with a DIFFERENT single-word category
 * keyword below — e.g. "land cruiser" / "land rover" both contain "land" (a `property` keyword),
 * so a naive single-word scan misfiles these (iconic, high-volume) vehicles under `property` and
 * a customer searching "Toyota Land Cruiser" gets zero results. These multi-word phrases are
 * recognized FIRST (specific-before-generic, exactly like the sale-method phrases below) and pin
 * the category; unlike the single-word scan they are deliberately NOT stripped from the text, so
 * the model name still narrows the free-text `search` term (the catalogue matches it by substring).
 */
const CATEGORY_PHRASES: readonly { re: RegExp; value: CategoryKey }[] = [
  { re: /\bland\s+cruiser\b/, value: 'vehicles' },
  { re: /\bland\s+rover\b/, value: 'vehicles' },
  { re: /\brange\s+rover\b/, value: 'vehicles' },
];

/**
 * A sale-method WORD/phrase -> `saleMethodValues` (docs/07). Checked in order — more specific
 * multi-word phrases are listed BEFORE the generic single word they contain (e.g. "live auction"
 * before bare "auction") so the first match is always the most specific one.
 */
const SALE_METHOD_PHRASES: readonly { re: RegExp; value: SaleMethod }[] = [
  { re: /\blive\s+hybrid\b/, value: 'LIVE_HYBRID' },
  { re: /\blive\s+auctions?\b/, value: 'LIVE_HYBRID' },
  { re: /\bhybrid\b/, value: 'LIVE_HYBRID' },
  { re: /\bsealed\s+tenders?\b/, value: 'SEALED_TENDER' },
  { re: /\btenders?\b/, value: 'SEALED_TENDER' },
  { re: /\bexpressions?\s+of\s+interest\b/, value: 'EXPRESSION_OF_INTEREST' },
  { re: /\beoi\b/, value: 'EXPRESSION_OF_INTEREST' },
  { re: /\bbuy\s*now\b/, value: 'BUY_NOW' },
  { re: /\bmake\s+an?\s+offers?\b/, value: 'MAKE_OFFER' },
  { re: /\boffers?\b/, value: 'MAKE_OFFER' },
  { re: /\btimed\s+auctions?\b/, value: 'TIMED_AUCTION' },
  { re: /\bauctions?\b/, value: 'TIMED_AUCTION' },
  { re: /\bbidding\b/, value: 'TIMED_AUCTION' },
];

/**
 * Known place names -> a free-text `location` filter value (matched against
 * `locationCity`/`locationRegion` via `contains`, so exact gazetteer coverage doesn't matter).
 * Multi-word phrases are listed first so e.g. "north western" wins over the bare "western" below.
 */
const LOCATION_KEYWORDS: readonly string[] = [
  'north western',
  'north central',
  'nuwara eliya',
  'sabaragamuwa',
  'colombo',
  'kandy',
  'galle',
  'jaffna',
  'negombo',
  'matara',
  'kurunegala',
  'anuradhapura',
  'trincomalee',
  'batticaloa',
  'ratnapura',
  'badulla',
  'gampaha',
  'kalutara',
  'western',
  'southern',
  'northern',
  'eastern',
  'central',
  'uva',
  'melbourne',
  'sydney',
  'auckland',
  'london',
  'dubai',
  'singapore',
  'mumbai',
  'chennai',
  'tokyo',
].sort((a, b) => b.length - a.length);

const ENDING_SOON_RE =
  /\b(ending soon|closing soon|ends soon|about to end|last chance|closing today|ending today|closing|ending)\b/;

// The v2 catalogue has NO server-side price filter (`catalogueQuerySchema` carries no min/max
// price field) — a "under/over X" clause is stripped entirely rather than either invented as an
// unsupported filter key or left to pollute the free-text `search` term below. Matched BEFORE
// punctuation is stripped so a digit-grouping comma ("500,000") still counts as one number, and
// an optional trailing magnitude word ("10 million", "500k", "2 crore") is consumed too so it
// can't survive as a phantom search token ("million") that returns zero matches.
const PRICE_PHRASE_RE =
  /\b(under|below|less\s+than|over|above|more\s+than)\s+(rs\.?|lkr|\$|£|€)?\s*[\d,]+(\.\d+)?\s*(k|m|mn|bn|thousand|thousands|million|millions|billion|billions|lakh|lakhs|crore|crores)?\b/g;

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'in',
  'on',
  'at',
  'for',
  'of',
  'to',
  'and',
  'or',
  'is',
  'are',
  'was',
  'were',
  'with',
  'me',
  'i',
  'please',
  'show',
  'find',
  'looking',
  'look',
  'want',
  'need',
  'search',
  'results',
  'near',
  'about',
  'any',
  'some',
  'you',
  'your',
  'can',
  'could',
  'would',
  'do',
  'does',
  'did',
  'it',
  'this',
  'that',
  'these',
  'those',
  'my',
  'our',
  'us',
  'we',
  'get',
]);

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Deterministic keyword -> structured-filter mapper. Every value it produces is later
 * re-validated against `catalogueQuerySchema` by the caller (`AssistantService.search`), so this
 * function does not need to be linguistically perfect — it only ever needs to NOT invent
 * inventory/results, which it structurally cannot: it returns filters, nothing else.
 */
export function interpretSearchQuery(query: string): SearchInterpretation {
  let working = ` ${query.toLowerCase()} `;
  working = working.replace(PRICE_PHRASE_RE, ' ');
  working = working.replace(/[.,!?;:()"'`]/g, ' ').replace(/\s+/g, ' ');

  const filters: Partial<CatalogueQuery> = {};

  for (const { re, value } of SALE_METHOD_PHRASES) {
    if (re.test(working)) {
      filters.saleMethod = value;
      working = working.replace(re, ' ');
      break;
    }
  }

  // Specific multi-word product phrases first: they PIN the category (e.g. "land cruiser" ->
  // vehicles) without being consumed, so an ambiguous head word ("land") can never fall through
  // to the single-word scan below and misfile the query under another category ("property").
  for (const { re, value } of CATEGORY_PHRASES) {
    if (re.test(working)) {
      filters.category = value;
      break;
    }
  }
  if (!filters.category) {
    for (const [word, category] of Object.entries(CATEGORY_KEYWORDS)) {
      const re = new RegExp(`\\b${word}\\b`);
      if (re.test(working)) {
        filters.category = category;
        working = working.replace(re, ' ');
        break;
      }
    }
  }

  for (const place of LOCATION_KEYWORDS) {
    const re = new RegExp(`\\b${place}\\b`);
    if (re.test(working)) {
      filters.location = titleCase(place);
      working = working.replace(re, ' ');
      break;
    }
  }

  if (ENDING_SOON_RE.test(working)) {
    filters.endingSoon = true;
    working = working.replace(ENDING_SOON_RE, ' ');
  }

  // Whatever salient words are left (after recognized category/saleMethod/location/endingSoon
  // keywords and stopwords are removed) become the free-text `search` term — e.g. "toyota" out
  // of "toyota in melbourne ending soon".
  const leftover = working
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  if (leftover.length > 0) {
    filters.search = leftover.join(' ').slice(0, 120);
  }

  const recognized = [
    filters.category,
    filters.saleMethod,
    filters.location,
    filters.endingSoon,
    filters.search,
  ].filter((v) => v !== undefined).length;
  const confidence = Math.min(0.9, 0.3 + recognized * 0.15);

  return { filters, confidence };
}
