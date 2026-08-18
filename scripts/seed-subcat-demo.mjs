#!/usr/bin/env node
/**
 * §3/§1 browser-test seed — publishes a spread of subcategory'd lots into the
 * running API (port 4000) so /catalogue shows the "Type" subcategory facet rail
 * and the per-card subcategory caption. Idempotent-ish: safe to re-run (creates
 * fresh publicRefs each time). NOT a migration or a test — a demo fixture.
 */
const BASE = 'http://127.0.0.1:4000';
const V1 = `${BASE}/api/v1`;

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

const token = async (roles, customerId) =>
  (await v1('/dev/token', { method: 'POST', body: { roles, customerId } })).json?.token;
const registerCustomer = async (label) =>
  (
    await v1('/customers', {
      method: 'POST',
      body: {
        legalName: label,
        email: `${label}${Date.now()}${Math.floor(Math.random() * 1e4)}@ex.com`,
      },
    })
  ).json?.id;

async function publish(
  sellerToken,
  staffToken,
  { category, subcategory, saleMethod, attrs, title },
) {
  const asset = await v1('/assets', {
    token: sellerToken,
    method: 'POST',
    body: { category, attributes: attrs, ...(subcategory ? { subcategory } : {}) },
  });
  if (!asset.json?.id)
    throw new Error(`asset create failed (${title}): ${JSON.stringify(asset.json)}`);
  const listing = await v1('/listings', {
    token: sellerToken,
    method: 'POST',
    body: {
      assetId: asset.json.id,
      saleMethod,
      title,
      publicRef: `SUB-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
    },
  });
  const id = listing.json?.id;
  if (!id) throw new Error(`listing create failed (${title}): ${JSON.stringify(listing.json)}`);
  await v1(`/listings/${id}/submit`, { token: sellerToken, method: 'POST' });
  await v1(`/listings/${id}/review`, {
    token: staffToken,
    method: 'POST',
    body: { decision: 'approve' },
  });
  await v1(`/listings/${id}/publish`, { token: staffToken, method: 'POST' });
  return id;
}

async function openAuction(staffToken, listingId, openingBidMinor) {
  const a = await v1('/auctions', {
    token: staffToken,
    method: 'POST',
    body: {
      listingId,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
      openingBidMinor,
      incrementMinor: 25_000,
    },
  });
  return a.json?.id;
}

const LOTS = [
  {
    category: 'vehicles',
    subcategory: 'suv_4x4',
    saleMethod: 'TIMED_AUCTION',
    attrs: { make: 'Toyota', model: 'Land Cruiser Prado', year: 2019 },
    title: 'Toyota Land Cruiser Prado 2019',
    auction: 12_500_000,
  },
  {
    category: 'vehicles',
    subcategory: 'suv_4x4',
    saleMethod: 'BUY_NOW',
    attrs: { make: 'Nissan', model: 'Patrol', year: 2020 },
    title: 'Nissan Patrol 2020',
  },
  {
    category: 'vehicles',
    subcategory: 'cars',
    saleMethod: 'TIMED_AUCTION',
    attrs: { make: 'Honda', model: 'Civic', year: 2021 },
    title: 'Honda Civic 2021',
    auction: 6_800_000,
  },
  {
    category: 'vehicles',
    subcategory: 'trucks',
    saleMethod: 'MAKE_OFFER',
    attrs: { make: 'Isuzu', model: 'Elf', year: 2018 },
    title: 'Isuzu Elf Tipper 2018',
  },
  {
    category: 'vehicles',
    subcategory: 'motorcycles',
    saleMethod: 'BUY_NOW',
    attrs: { make: 'Yamaha', model: 'FZ-S', year: 2022 },
    title: 'Yamaha FZ-S 2022',
  },
  {
    category: 'scrap',
    subcategory: 'copper',
    saleMethod: 'EXPRESSION_OF_INTEREST',
    attrs: { material: 'Copper cable offcuts', quantity: 3.5, unit: 'MT' },
    title: 'Copper cable scrap — 3.5 MT',
  },
  {
    category: 'scrap',
    subcategory: 'ferrous',
    saleMethod: 'BUY_NOW',
    attrs: { material: 'Mild steel plate offcuts', quantity: 12, unit: 'MT' },
    title: 'Mild steel offcuts — 12 MT',
  },
  {
    category: 'bulk',
    subcategory: 'vegetables',
    saleMethod: 'MAKE_OFFER',
    attrs: { itemType: 'Red onions', quantity: 40, unit: 'MT' },
    title: 'Red onions — 40 MT lot',
  },
];

async function main() {
  const sellerId = await registerCustomer('subseller');
  const sellerToken = await token(['seller'], sellerId);
  const staffToken = await token(['auction_staff'], sellerId);
  if (!sellerToken || !staffToken) throw new Error('token mint failed');

  for (const lot of LOTS) {
    const id = await publish(sellerToken, staffToken, lot);
    if (lot.auction) await openAuction(staffToken, id, lot.auction);
    console.log('  ✓ published', lot.category, '/', lot.subcategory, '—', lot.title);
  }

  const veh = await v2('/catalogue?category=vehicles&limit=60');
  const scrap = await v2('/catalogue?category=scrap&limit=60');
  console.log('\nvehicles subcategory facet:', JSON.stringify(veh.json?.facets?.subcategory));
  console.log('scrap subcategory facet:', JSON.stringify(scrap.json?.facets?.subcategory));
  console.log(
    'total vehicles cards:',
    (veh.json?.items || []).length,
    '| scrap cards:',
    (scrap.json?.items || []).length,
  );
  const sample = (veh.json?.items || [])[0];
  console.log('sample vehicle card subcategory field:', sample?.subcategory);
}

main().catch((e) => {
  console.error('SEED FAILED:', e.message);
  process.exit(1);
});
