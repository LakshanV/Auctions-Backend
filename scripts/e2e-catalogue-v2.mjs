#!/usr/bin/env node
/**
 * Alignment increment 1 E2E (consolidated pack docs 06/07): the authoritative
 * Watch list and the enriched /api/v2 catalogue. Proves: server-side filtering
 * (category/saleMethod/search), pagination, facet counts, and the SALE-AWARE
 * discriminated card (an auction card carries currentBid; an EOI card carries
 * kind='eoi' and NO currentBid). Watch add/list/count/remove is server-owned.
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
const v2 = (p, o) => call(`${BASE}/api/v2${p}`, o);

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
      body: { legalName: label, email: `${label}${Date.now()}@ex.com` },
    })
  ).json?.id;

async function publishListing(sellerToken, staffToken, category, saleMethod, attrs, title) {
  const asset = await v1('/assets', {
    token: sellerToken,
    method: 'POST',
    body: { category, attributes: attrs },
  });
  const listing = await v1('/listings', {
    token: sellerToken,
    method: 'POST',
    body: {
      assetId: asset.json.id,
      saleMethod,
      title,
      publicRef: `V2-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
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
  return id;
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

    const sellerId = await registerCustomer('seller');
    const buyer = await registerCustomer('buyer');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff'], sellerId);
    const buyerToken = await token(['customer'], buyer);

    // One auction + one EOI listing, both published (public).
    const auctionListing = await publishListing(
      sellerToken,
      staffToken,
      'vehicles',
      'TIMED_AUCTION',
      { make: 'Toyota', model: 'Vitz', year: 2016 },
      'Toyota Vitz 2016',
    );
    await v1('/auctions', {
      token: staffToken,
      method: 'POST',
      body: {
        listingId: auctionListing,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        openingBidMinor: 1_500_000,
        incrementMinor: 25_000,
      },
    });
    const eoiListing = await publishListing(
      sellerToken,
      staffToken,
      'property',
      'EXPRESSION_OF_INTEREST',
      {
        propertyType: 'commercial',
        district: 'Kandy',
      },
    );
    // A second vehicles lot so the per-category Rubik row has >1 page at limit=1.
    const _auctionListing2 = await publishListing(
      sellerToken,
      staffToken,
      'vehicles',
      'BUY_NOW',
      { make: 'Honda', model: 'Fit', year: 2018 },
      'Honda Fit 2018',
    );

    // --- v2 catalogue: list + facets + pagination ---
    const all = await v2('/catalogue?limit=24');
    check(
      all.status === 200 && Array.isArray(all.json?.items),
      'v2 catalogue returns a paginated envelope',
    );
    check(
      all.json?.total >= 2 && all.json?.page === 1 && all.json?.totalPages >= 1,
      'pagination fields present',
    );
    check(
      Array.isArray(all.json?.facets?.category) && Array.isArray(all.json?.facets?.saleMethod),
      'facets include category + saleMethod counts',
    );

    // Filter by category.
    const vehicles = await v2('/catalogue?category=vehicles');
    check(
      vehicles.json?.items.length >= 1 &&
        vehicles.json.items.every((i) => i.category === 'vehicles'),
      'category filter returns only vehicles',
    );

    // Search.
    const searched = await v2('/catalogue?search=Vitz');
    check(searched.json?.total >= 1, 'search matches the auction lot title');

    // --- Per-category Rubik row: independent cursor pagination (pack 01 doc 05) ---
    const rowP1 = await v2('/catalogue/row?category=vehicles&limit=1');
    check(
      rowP1.status === 200 &&
        rowP1.json?.category === 'vehicles' &&
        rowP1.json.items.length === 1 &&
        rowP1.json.items[0].category === 'vehicles',
      'row endpoint returns a single-category slice',
    );
    check(
      rowP1.json?.exhausted === false && typeof rowP1.json?.nextCursor === 'string',
      'row page 1 is not exhausted and carries a nextCursor (>1 vehicles lot reachable)',
    );
    const rowP2 = await v2(
      `/catalogue/row?category=vehicles&limit=1&cursor=${rowP1.json.nextCursor}`,
    );
    check(
      rowP2.status === 200 &&
        rowP2.json.items.length === 1 &&
        rowP2.json.items[0].id !== rowP1.json.items[0].id,
      'row page 2 (via cursor) returns the NEXT distinct vehicles lot — every item reachable',
    );
    // Walk the cursor chain to the end. Robust to other suites' data in the
    // shared acceptance DB: proves EVERY item is reachable (no repeats) and that
    // the row terminates (reaches exhausted) — the two properties that matter.
    const seen = new Set();
    let walk = rowP1.json;
    let steps = 0;
    let duplicate = false;
    for (;;) {
      for (const it of walk.items) {
        if (seen.has(it.id)) duplicate = true;
        seen.add(it.id);
      }
      if (walk.exhausted || !walk.nextCursor || steps++ > 1000) break;
      walk = (await v2(`/catalogue/row?category=vehicles&limit=1&cursor=${walk.nextCursor}`)).json;
    }
    check(
      walk.exhausted === true && !duplicate && seen.size >= 2,
      `vehicles row cursor chain terminates, no repeats, all ${seen.size} reachable`,
    );
    const rowEmpty = await v2('/catalogue/row?category=nonexistent&limit=5');
    check(
      rowEmpty.status === 200 &&
        rowEmpty.json.items.length === 0 &&
        rowEmpty.json.exhausted === true,
      'row for an empty category is exhausted with no items',
    );

    // Sale-aware price sort: within Buy Now, order by buy-now price (doc 05).
    const buyNowAsc = await v2('/catalogue?saleMethod=BUY_NOW&sort=price_asc');
    check(
      buyNowAsc.status === 200 &&
        buyNowAsc.json.items.every((i) => i.commercial.kind === 'buy_now'),
      'sale-aware sort: Buy Now price sort returns only buy_now cards',
    );

    // Sale-aware cards: auction has currentBid; EOI does NOT.
    const auctionCard = all.json.items.find((i) => i.id === auctionListing);
    const eoiCard = all.json.items.find((i) => i.id === eoiListing);
    check(
      auctionCard?.commercial?.kind === 'auction' &&
        auctionCard.commercial.currentBidMinor === 1_500_000,
      `auction card carries currentBid (${auctionCard?.commercial?.currentBidMinor})`,
    );
    check(
      eoiCard?.commercial?.kind === 'eoi' && eoiCard.commercial.currentBidMinor === undefined,
      'EOI card has kind=eoi and NO currentBid (doc 07)',
    );

    // Enriched detail.
    const detail = await v2(`/catalogue/${auctionListing}`);
    check(
      detail.status === 200 && detail.json?.media !== undefined && 'attributes' in detail.json,
      'v2 lot detail is enriched',
    );

    // --- §19 seller verification projection (customer-safe badge + filter) ---
    // A second seller whose identity is verified (Customer.kycStatus='verified' via the
    // compliance-gated KYC command); the first seller stays unverified.
    const verifiedSellerId = await registerCustomer('vseller');
    const verifiedSellerToken = await token(['seller'], verifiedSellerId);
    const complianceToken = await token(['compliance'], verifiedSellerId);
    const kyc = await v1(`/customers/${verifiedSellerId}/kyc`, {
      token: complianceToken,
      method: 'POST',
      body: { status: 'verified' },
    });
    check(
      kyc.status === 200 || kyc.status === 201,
      `compliance can mark a seller KYC-verified (got ${kyc.status})`,
    );
    const verifiedListing = await publishListing(
      verifiedSellerToken,
      staffToken,
      'vehicles',
      'BUY_NOW',
      { make: 'Nissan', model: 'Leaf', year: 2019 },
      'Nissan Leaf 2019 (verified seller)',
    );

    const withSeller = await v2('/catalogue?category=vehicles&limit=60');
    const vCard = withSeller.json.items.find((i) => i.id === verifiedListing);
    const uCard = withSeller.json.items.find((i) => i.id === auctionListing);
    check(vCard?.seller?.verified === true, 'verified-seller lot projects seller.verified=true');
    check(
      uCard?.seller?.verified === false,
      'unverified-seller lot projects seller.verified=false',
    );
    // The projection is a LONE boolean — the raw kycStatus / seller identity never leaks.
    check(
      vCard &&
        typeof vCard.seller?.verified === 'boolean' &&
        Object.keys(vCard.seller).length === 1 &&
        !('kycStatus' in vCard) &&
        !('legalName' in vCard) &&
        !('owner' in vCard),
      'seller projection is a single boolean (kycStatus / identity never exposed)',
    );

    // verifiedOnly facet: exact — only verified-seller lots, unverified excluded.
    const onlyVerified = await v2('/catalogue?verifiedOnly=true&limit=60');
    check(
      onlyVerified.json.items.length >= 1 &&
        onlyVerified.json.items.every((i) => i.seller?.verified === true),
      'verifiedOnly=true returns only verified-seller lots',
    );
    check(
      !onlyVerified.json.items.some((i) => i.id === auctionListing),
      'verifiedOnly excludes the unverified-seller lot',
    );
    // Detail + Rubik row inherit the same signal.
    const vDetail = await v2(`/catalogue/${verifiedListing}`);
    check(vDetail.json?.seller?.verified === true, 'lot detail carries seller.verified');
    const vRow = await v2('/catalogue/row?category=vehicles&verifiedOnly=true&limit=30');
    check(
      vRow.json.items.length >= 1 && vRow.json.items.every((i) => i.seller?.verified === true),
      'row endpoint honours verifiedOnly + projects seller.verified',
    );

    // --- Watch: authoritative, server-owned ---
    const denied = await v1('/watch', {
      token: staffToken,
      method: 'POST',
      body: { listingId: auctionListing },
    });
    // staff (auction_staff) lacks watch:manage → 403
    check(
      denied.status === 403,
      `non-watcher role blocked from watch -> 403 (got ${denied.status})`,
    );

    const added = await v1('/watch', {
      token: buyerToken,
      method: 'POST',
      body: { listingId: auctionListing },
    });
    check(added.json?.watching === true, 'buyer added a lot to the watchlist');
    // Idempotent.
    await v1('/watch', { token: buyerToken, method: 'POST', body: { listingId: auctionListing } });

    const mine = await v1('/watch', { token: buyerToken });
    check(
      mine.json?.length === 1 && mine.json[0].listingId === auctionListing,
      'watchlist returns the watched lot',
    );

    const count = await v1(`/watch/${auctionListing}/count`);
    check(count.json?.watchers === 1, 'public watcher count = 1');

    // Card reflects the watcher count.
    const afterWatch = await v2('/catalogue?category=vehicles');
    const watchedCard = afterWatch.json.items.find((i) => i.id === auctionListing);
    check(watchedCard?.watchers === 1, 'catalogue card shows watcher count');

    // --- Command-centre projection (doc 05) ---
    const dashAnon = await v2('/me/dashboard');
    check(
      dashAnon.status === 401 || dashAnon.status === 403,
      `dashboard requires auth (got ${dashAnon.status})`,
    );
    // A non-Singha, non-Supabase bearer must fall through to anonymous (proves
    // the two-issuer PrincipalMiddleware fallback path doesn't crash).
    const dashGarbage = await v2('/me/dashboard', { token: 'not.a.valid.jwt' });
    check(
      dashGarbage.status === 401 || dashGarbage.status === 403,
      `invalid bearer → anonymous, not 500 (got ${dashGarbage.status})`,
    );
    const dash = await v2('/me/dashboard', { token: buyerToken });
    check(
      dash.status === 200 && !!dash.json?.strip && Array.isArray(dash.json?.groups),
      'dashboard projection returns a strip + status groups',
    );
    const watchingGroup = dash.json?.groups?.find((g) => g.key === 'WATCHING');
    check(
      watchingGroup?.items?.some((l) => l.listingId === auctionListing),
      'dashboard WATCHING band contains the watched lot',
    );

    const removed = await v1(`/watch/${auctionListing}`, { token: buyerToken, method: 'DELETE' });
    check(removed.json?.watching === false, 'buyer removed the lot');
    const afterRemove = await v1('/watch', { token: buyerToken });
    check(afterRemove.json?.length === 0, 'watchlist empty after removal');
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} catalogue-v2/watch E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll catalogue-v2 + watch E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
