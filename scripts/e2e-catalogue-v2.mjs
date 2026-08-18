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

async function publishListing(
  sellerToken,
  staffToken,
  category,
  saleMethod,
  attrs,
  title,
  subcategory,
) {
  const asset = await v1('/assets', {
    token: sellerToken,
    method: 'POST',
    body: { category, attributes: attrs, ...(subcategory ? { subcategory } : {}) },
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

    // --- §3 customer-facing subcategory taxonomy ---
    const suvListing = await publishListing(
      sellerToken,
      staffToken,
      'vehicles',
      'BUY_NOW',
      { make: 'Toyota', model: 'Prado', year: 2018 },
      'Toyota Prado 2018',
      'suv_4x4',
    );
    const withSubcat = await v2('/catalogue?category=vehicles&limit=60');
    const suvCard = withSubcat.json.items.find((i) => i.id === suvListing);
    check(suvCard?.subcategory === 'suv_4x4', 'card projects the customer-facing subcategory');
    const facetVehicles = withSubcat.json.facets?.subcategory ?? [];
    check(
      facetVehicles.some((f) => f.value === 'suv_4x4' && f.count >= 1 && f.label === 'SUVs / 4x4'),
      'subcategory facet (with labels) appears within the selected category',
    );
    const onlySuv = await v2('/catalogue?category=vehicles&subcategory=suv_4x4&limit=60');
    check(
      onlySuv.json.items.length >= 1 &&
        onlySuv.json.items.every((i) => i.subcategory === 'suv_4x4'),
      'subcategory filter returns only that subcategory',
    );
    check(
      !onlySuv.json.items.some((i) => i.id === auctionListing),
      'subcategory filter excludes other-subcategory vehicles',
    );
    // Server rejects a subcategory that is not valid for the category.
    const badSub = await v1('/assets', {
      token: sellerToken,
      method: 'POST',
      body: {
        category: 'vehicles',
        attributes: { make: 'X', model: 'Y', year: 2010 },
        subcategory: 'sapphire',
      },
    });
    check(
      badSub.status === 400,
      `an invalid subcategory for the category is rejected (got ${badSub.status})`,
    );

    // --- §2/§11 seller-declared quantity/unit + structured Incoterm/logistics ---
    const logiListing = await publishListing(
      sellerToken,
      staffToken,
      'bulk',
      'MAKE_OFFER',
      { itemType: 'Red onions', quantity: 40, unit: 'MT' },
      'Red onions — 40 MT lot',
      'vegetables',
    );
    // Invalid Incoterm is rejected by the content contract.
    const badIncoterm = await v1(`/listings/${logiListing}/content`, {
      token: sellerToken,
      method: 'PATCH',
      body: { defaultIncoterm: 'ZZZ' },
    });
    check(
      badIncoterm.status === 400,
      `an unknown Incoterm is rejected by the content contract (got ${badIncoterm.status})`,
    );
    // Seller declares the structured commercial + logistics terms.
    const patched = await v1(`/listings/${logiListing}/content`, {
      token: sellerToken,
      method: 'PATCH',
      body: {
        quantityAvailable: 40,
        minOrderQuantity: 5,
        quantityUnitCode: 'MT',
        unitPriceMinor: 120000,
        pricingBasis: 'per_unit',
        defaultIncoterm: 'FOB',
        pickupAvailable: true,
        deliveryAvailable: true,
      },
    });
    check(patched.status === 200, `seller sets structured qty + logistics (got ${patched.status})`);

    const logiCards = await v2('/catalogue?category=bulk&limit=60');
    const logiCard = logiCards.json.items.find((i) => i.id === logiListing);
    check(logiCard?.quantity === '40', 'card projects seller-declared quantity');
    check(logiCard?.quantityUnitCode === 'MT', 'card projects the unit code');
    check(logiCard?.incoterm === 'FOB', 'card projects the seller-declared Incoterm');
    check(logiCard?.pickupAvailable === true, 'card reflects declared pickup availability');
    check(logiCard?.deliveryAvailable === true, 'card reflects declared delivery availability');

    // Structured facets now find the lot via the seller's declaration (not just Location roles).
    const byUnit = await v2('/catalogue?category=bulk&unit=MT&limit=60');
    check(
      byUnit.json.items.some((i) => i.id === logiListing),
      'unit facet matches the lot',
    );
    const byPickup = await v2('/catalogue?category=bulk&pickup=true&limit=60');
    check(
      byPickup.json.items.some((i) => i.id === logiListing),
      'pickup facet matches the lot',
    );
    const byDelivery = await v2('/catalogue?category=bulk&delivery=true&limit=60');
    check(
      byDelivery.json.items.some((i) => i.id === logiListing),
      'delivery facet matches the lot',
    );
    const byQty = await v2('/catalogue?category=bulk&minQuantity=30&maxQuantity=50&limit=60');
    check(
      byQty.json.items.some((i) => i.id === logiListing),
      'quantity-band facet matches the lot',
    );

    // Lot detail carries the richer structured commercial fields.
    const logiDetail = await v2(`/catalogue/${logiListing}`);
    check(logiDetail.json?.minOrderQuantity === '5', 'detail carries min order quantity');
    check(logiDetail.json?.unitPriceMinor === 120000, 'detail carries unit price (minor)');
    check(logiDetail.json?.pricingBasis === 'per_unit', 'detail carries pricing basis');
    check(logiDetail.json?.incoterm === 'FOB', 'detail carries the Incoterm');

    // Regression: the seller wizard PATCHes content (which can set a BigInt unit-price column)
    // BEFORE submitting. Submitting a listing that already carries a non-null BigInt money column
    // must not 500 on JSON serialization (the transition endpoints return a BigInt-safe view).
    const bigAsset = await v1('/assets', {
      token: sellerToken,
      method: 'POST',
      body: { category: 'bulk', attributes: { itemType: 'X', quantity: 1, unit: 'kg' } },
    });
    const bigListing = await v1('/listings', {
      token: sellerToken,
      method: 'POST',
      body: {
        assetId: bigAsset.json.id,
        saleMethod: 'MAKE_OFFER',
        title: 'Unit-priced lot',
        publicRef: `BIG-${Date.now()}`,
      },
    });
    await v1(`/listings/${bigListing.json.id}/content`, {
      token: sellerToken,
      method: 'PATCH',
      body: { unitPriceMinor: 999999, quantityAvailable: 2, quantityUnitCode: 'kg' },
    });
    const submitAfterPrice = await v1(`/listings/${bigListing.json.id}/submit`, {
      token: sellerToken,
      method: 'POST',
      body: {},
    });
    check(
      submitAfterPrice.status === 200 || submitAfterPrice.status === 201,
      `submitting a listing that already carries a unit price does not 500 (got ${submitAfterPrice.status})`,
    );

    // --- §5 server-generated Singha reference: omit publicRef → server assigns SNG-YYYY-XXXXXXXX ---
    const refAsset = await v1('/assets', {
      token: sellerToken,
      method: 'POST',
      body: { category: 'general', attributes: {} },
    });
    const autoListing = await v1('/listings', {
      token: sellerToken,
      method: 'POST',
      body: { assetId: refAsset.json.id, saleMethod: 'BUY_NOW', title: 'Auto-ref lot' },
    });
    check(
      autoListing.status === 201 &&
        /^SNG-\d{4}-[0-9A-Z]{8}$/.test(autoListing.json?.publicRef ?? ''),
      `listing created without a publicRef gets an auto-assigned Singha reference (got ${autoListing.json?.publicRef})`,
    );
    // A second one is distinct (derived from each listing's unique id).
    const autoListing2 = await v1('/listings', {
      token: sellerToken,
      method: 'POST',
      body: { assetId: refAsset.json.id, saleMethod: 'BUY_NOW', title: 'Auto-ref lot 2' },
    });
    check(
      autoListing2.json?.publicRef && autoListing2.json.publicRef !== autoListing.json.publicRef,
      'a second auto-referenced listing gets a distinct reference',
    );

    // --- §6/§7 pre-publish quality-control gate (deterministic, advisory) ---
    const qcIncomplete = await v1('/listings/quality-check', {
      token: sellerToken,
      method: 'POST',
      body: {
        saleMethod: 'BUY_NOW',
        category: 'vehicles',
        title: '',
        presentAttributeKeys: ['make'], // missing model + year
        photoCount: 0,
        hasCover: false,
        buyNowPriceMinor: null,
      },
    });
    check(
      qcIncomplete.status === 200 &&
        qcIncomplete.json?.status === 'incomplete' &&
        qcIncomplete.json?.advisory === true,
      `QC marks an empty listing incomplete + advisory (got ${qcIncomplete.json?.status})`,
    );
    check(
      (qcIncomplete.json?.checks ?? []).some(
        (c) => c.key === 'required_attributes' && c.severity === 'critical',
      ),
      'QC derives required category attributes server-side (missing model/year → critical)',
    );
    check(
      (qcIncomplete.json?.checks ?? []).some((c) => c.key === 'price' && c.severity === 'critical'),
      'QC flags a Buy Now listing with no price as critical',
    );

    const qcReady = await v1('/listings/quality-check', {
      token: sellerToken,
      method: 'POST',
      body: {
        saleMethod: 'BUY_NOW',
        category: 'vehicles',
        title: 'Toyota Land Cruiser Prado 2019',
        fullDescription: 'One owner, full service history, no accidents.',
        presentAttributeKeys: ['make', 'model', 'year'],
        photoCount: 4,
        hasCover: true,
        buyNowPriceMinor: 12_500_000,
        hasLocation: true,
      },
    });
    check(
      qcReady.status === 200 && qcReady.json?.status === 'ready' && qcReady.json?.score === 100,
      `QC scores a complete listing ready (got ${qcReady.json?.status}/${qcReady.json?.score})`,
    );

    // Per-listing assessment recomputes from the persisted listing (owner or staff).
    const qcListing = await v1(`/listings/${auctionListing}/quality-check`, { token: sellerToken });
    check(
      qcListing.status === 200 &&
        Array.isArray(qcListing.json?.checks) &&
        typeof qcListing.json?.score === 'number',
      `per-listing quality assessment returns score + checks (got ${qcListing.status})`,
    );
    // A non-owner, non-staff customer cannot read someone else's assessment.
    const qcForbidden = await v1(`/listings/${auctionListing}/quality-check`, {
      token: buyerToken,
    });
    check(
      qcForbidden.status === 403,
      `a non-owner/non-staff cannot read the assessment (got ${qcForbidden.status})`,
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
