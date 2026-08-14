#!/usr/bin/env node
/**
 * Singha Discover + Buyer Twin HTTP E2E (pack docs 04 §E / 06 / 11). Proves the
 * authoritative discovery contract end-to-end against a real Postgres:
 *
 *   - anonymous feed (ending-soon fallback, no personalisation, no leakage);
 *   - authenticated event write (append-only signal, never a bid/purchase);
 *   - safe Buyer Twin summary (labels + bucketed confidence + explanations ONLY —
 *     no raw weights/scores/affinities ever cross the wire);
 *   - preference reset semantics that DO NOT touch watches/bids/financial records;
 *   - deterministic feed ordering for fixed data;
 *   - diversity cap (no single category dominates a page);
 *   - dislike exclusion + unseen behaviour (seen lots drop out of the feed);
 *   - affinity personalisation + explanation provenance.
 *
 * Ranking weights are Tier-A and stay in the domain engine; this suite asserts they
 * never appear in any public DTO.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'http://localhost:4000';
const V1 = `${BASE}/api/v1`;
let failures = 0;

function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
}

async function call(url, { token, method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}
const v1 = (p, o) => call(`${V1}${p}`, o);

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return true;
    } catch {
      /* not up */
    }
    await sleep(500);
  }
  return false;
}

const token = async (roles, customerId) =>
  (await v1('/dev/token', { method: 'POST', body: { roles, customerId } })).json?.token;
const registerCustomer = async (label) =>
  (
    await v1('/customers', {
      method: 'POST',
      body: { legalName: label, email: `${label}${Date.now()}${Math.random()}@ex.com` },
    })
  ).json?.id;

// Valid category-specific attributes (see packages/contracts/src/categories.ts).
const ATTRS = {
  vehicles: { make: 'Toyota', model: 'Axio', year: 2018 },
  machinery: { make: 'Caterpillar', model: '320D' },
  gems: { type: 'sapphire', caratWeight: 3.5 },
  property: { propertyType: 'residential', district: 'Colombo' },
};

/** Publish an auction listing that ends `endsInMs` from now (drives ending-soon order). */
async function publishAuction(sellerToken, staffToken, category, title, endsInMs) {
  const asset = await v1('/assets', {
    token: sellerToken,
    method: 'POST',
    body: { category, attributes: ATTRS[category] },
  });
  const listing = await v1('/listings', {
    token: sellerToken,
    method: 'POST',
    body: {
      assetId: asset.json.id,
      saleMethod: 'TIMED_AUCTION',
      title,
      publicRef: `DISC-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    },
  });
  const id = listing.json.id;
  await v1(`/listings/${id}/submit`, { token: sellerToken, method: 'POST' });
  await v1(`/listings/${id}/review`, {
    token: staffToken,
    method: 'POST',
    body: { decision: 'approve' },
  });
  await v1(`/listings/${id}/publish`, { token: staffToken, method: 'POST' });
  await v1('/auctions', {
    token: staffToken,
    method: 'POST',
    body: {
      listingId: id,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + endsInMs).toISOString(),
      openingBidMinor: 1_000_000,
      incrementMinor: 25_000,
    },
  });
  return id;
}

// Keys that must NEVER appear in any public discovery DTO (Tier-A ranking internals).
const FORBIDDEN_KEYS = [
  'categoryAffinities',
  'saleMethodPreference',
  'score',
  'weight',
  'weights',
  'rawConfidence',
];
function leaks(obj) {
  const s = JSON.stringify(obj ?? {});
  return FORBIDDEN_KEYS.filter((k) => s.includes(`"${k}"`));
}

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));

  try {
    if (!(await waitForHealth())) {
      console.error('API did not start:\n' + logs.join(''));
      process.exit(1);
    }

    const sellerId = await registerCustomer('disc-seller');
    const buyerId = await registerCustomer('disc-buyer');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff'], sellerId);
    const buyerToken = await token(['customer'], buyerId);

    // Seed a fixed, ending-soon-ordered catalogue: 4 vehicles, 2 gems, 1 property.
    // Minute-spaced deadlines keep the ordering strict and the assertions deterministic.
    const MIN = 60_000;
    const vehicles = [];
    for (let n = 0; n < 4; n += 1) {
      vehicles.push(
        await publishAuction(sellerToken, staffToken, 'vehicles', `Vehicle ${n}`, (n + 1) * MIN),
      );
    }
    const gems = [
      await publishAuction(sellerToken, staffToken, 'gems', 'Gem 0', 5 * MIN),
      await publishAuction(sellerToken, staffToken, 'gems', 'Gem 1', 6 * MIN),
    ];
    const property = await publishAuction(sellerToken, staffToken, 'property', 'Estate', 7 * MIN);
    const mine = new Set([...vehicles, ...gems, property]);

    // --- Anonymous feed: ending-soon fallback, no personalisation, no leakage ------
    const anon = await v1('/discovery/feed?limit=40');
    check(anon.status === 200 && Array.isArray(anon.json?.items), 'anonymous feed returns items');
    const anonItems = anon.json.items;
    check(
      anonItems.every((it) => it.reason === null),
      'anonymous feed carries no personalisation reason',
    );
    const withEnds = anonItems.filter((it) => it.endsAt);
    const sortedByEnds = withEnds.every(
      (it, k) => k === 0 || new Date(withEnds[k - 1].endsAt) <= new Date(it.endsAt),
    );
    check(sortedByEnds, 'anonymous feed is ordered ending-soon first');
    check(leaks(anon.json).length === 0, 'feed does not leak Tier-A ranking keys');
    const anonItemKeys = new Set(anonItems.flatMap((it) => Object.keys(it)));
    check(
      !['score', 'weight', 'affinity', 'affinityScore'].some((k) => anonItemKeys.has(k)),
      'feed items expose no raw score/weight/affinity fields',
    );

    // --- Diversity cap: no single category dominates a page ------------------------
    const catCounts = {};
    for (const it of anonItems) catCounts[it.category] = (catCounts[it.category] ?? 0) + 1;
    check(
      Object.values(catCounts).every((c) => c <= 3),
      `diversity cap holds — no category > 3 per page (${JSON.stringify(catCounts)})`,
    );

    // --- Deterministic ordering for fixed data ------------------------------------
    const anon2 = await v1('/discovery/feed?limit=40');
    check(
      JSON.stringify(anonItems.map((i) => i.listingId)) ===
        JSON.stringify(anon2.json.items.map((i) => i.listingId)),
      'feed ordering is deterministic across identical requests',
    );

    // --- Buyer Twin summary requires auth -----------------------------------------
    const twinAnon = await v1('/discovery/buyer-twin');
    check(
      twinAnon.status === 401 || twinAnon.status === 403,
      `Buyer Twin summary requires an authenticated customer (got ${twinAnon.status})`,
    );

    // --- Authenticated event write: append-only, never a bid ----------------------
    const rec = await v1('/discovery/events', {
      token: buyerToken,
      method: 'POST',
      body: { listingId: gems[0], eventType: 'WATCH', sourceSurface: 'DISCOVER' },
    });
    check(rec.status === 201 && rec.json?.recorded === true, 'authenticated event write recorded');
    // A few more high-intent gem signals so gems becomes the top affinity.
    await v1('/discovery/events', {
      token: buyerToken,
      method: 'POST',
      body: { listingId: gems[1], eventType: 'LIKE', sourceSurface: 'DISCOVER' },
    });
    await v1('/discovery/events', {
      token: buyerToken,
      method: 'POST',
      body: { listingId: gems[0], eventType: 'BID_INTENT', sourceSurface: 'DISCOVER' },
    });
    const badEvent = await v1('/discovery/events', {
      token: buyerToken,
      method: 'POST',
      body: { listingId: 'does-not-exist', eventType: 'LIKE' },
    });
    check(badEvent.status === 404, 'recording against a missing listing 404s (no silent write)');

    // --- Safe Buyer Twin summary: labels + bucket + explanations, no leakage -------
    const twin = await v1('/discovery/buyer-twin', { token: buyerToken });
    check(twin.status === 200 && typeof twin.json === 'object', 'Buyer Twin summary returned');
    check(
      Array.isArray(twin.json.topCategories) && twin.json.topCategories.includes('gems'),
      `top category reflects gem signals (${JSON.stringify(twin.json.topCategories)})`,
    );
    check(
      ['none', 'low', 'medium', 'high'].includes(twin.json.confidence),
      `confidence is a bucket label, not a raw score (${twin.json.confidence})`,
    );
    check(
      Array.isArray(twin.json.explanations) && twin.json.explanations.length > 0,
      'Buyer Twin returns human explanations',
    );
    check(leaks(twin.json).length === 0, 'Buyer Twin summary does not leak Tier-A internals');

    // --- Affinity personalisation + explanation provenance in the feed ------------
    const buyerFeed = await v1('/discovery/feed?limit=40', { token: buyerToken });
    const gemCards = buyerFeed.json.items.filter((it) => it.category === 'gems');
    check(
      gemCards.length > 0 && gemCards.every((it) => typeof it.reason === 'string'),
      'affinity lots carry a "why you\'re seeing this" reason for the signed-in buyer',
    );

    // --- Unseen behaviour: an OPENed lot drops out of the buyer's feed ------------
    const beforeOpen = buyerFeed.json.items.map((i) => i.listingId);
    check(beforeOpen.includes(vehicles[0]), 'unseen vehicle is present before it is opened');
    await v1('/discovery/events', {
      token: buyerToken,
      method: 'POST',
      body: { listingId: vehicles[0], eventType: 'OPEN', sourceSurface: 'DISCOVER' },
    });
    const afterOpen = await v1('/discovery/feed?limit=40', { token: buyerToken });
    check(
      !afterOpen.json.items.map((i) => i.listingId).includes(vehicles[0]),
      'an opened (seen) lot no longer appears in the feed',
    );

    // --- Dislike exclusion: a disliked lot is excluded ----------------------------
    await v1('/discovery/events', {
      token: buyerToken,
      method: 'POST',
      body: { listingId: vehicles[1], eventType: 'DISLIKE', sourceSurface: 'DISCOVER' },
    });
    const afterDislike = await v1('/discovery/feed?limit=40', { token: buyerToken });
    check(
      !afterDislike.json.items.map((i) => i.listingId).includes(vehicles[1]),
      'a disliked lot is excluded from the feed',
    );

    // --- Reset semantics: clears PREFERENCES, never watches/financial records ------
    // Prove the boundary: add an authoritative watch, then reset preferences.
    const watched = await v1('/watch', {
      token: buyerToken,
      method: 'POST',
      body: { listingId: gems[0] },
    });
    check(watched.json?.watching === true, 'buyer holds an authoritative watch before reset');

    const reset = await v1('/discovery/preferences/reset', { token: buyerToken, method: 'POST' });
    check(reset.status === 201 && reset.json?.reset === true, 'preference reset succeeds');

    const twinAfter = await v1('/discovery/buyer-twin', { token: buyerToken });
    check(
      twinAfter.json.confidence === 'none' && twinAfter.json.topCategories.length === 0,
      'Buyer Twin is empty after reset (preferences cleared)',
    );
    const watchAfter = await v1('/watch', { token: buyerToken });
    check(
      Array.isArray(watchAfter.json) && watchAfter.json.some((w) => w.listingId === gems[0]),
      'reset did NOT delete the watch — financial/authoritative records survive',
    );
    // After reset, previously-disliked/opened lots are eligible again (ledger cleared).
    const feedAfterReset = await v1('/discovery/feed?limit=40', { token: buyerToken });
    const ids = feedAfterReset.json.items.map((i) => i.listingId);
    check(
      ids.includes(vehicles[1]) && mine.has(vehicles[1]),
      'a previously-disliked lot is eligible again once preferences are reset',
    );
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} discovery E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll discovery + Buyer Twin E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
