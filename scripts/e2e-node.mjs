#!/usr/bin/env node
/**
 * Evolution E13 Satellite Market Node + SEO E2E (pack Addendum A + doc 11 §SEO). Boots the built API
 * with FEATURE_SATELLITE_NODES ON and proves the non-negotiable invariant + SEO helpers:
 *  - a node resolves its mode / presets / capabilities;
 *  - Discovery nodes originate nothing; an unverified Local Commerce node is MANUAL_REVIEW_REQUIRED;
 *    a disabled capability is refused; a verified, enabled node may originate (attribution only);
 *  - a node-originated listing is the SAME central canonical record (Discovery reads it from the one
 *    central Listing table — there is no per-country ledger);
 *  - SEO canonical strips display-currency/tracking params (one URL per listing), hreflang + JSON-LD
 *    are deterministic.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import PrismaPkg from '@prisma/client';

const { PrismaClient } = PrismaPkg;
const BASE = 'http://localhost:4000';
const API = `${BASE}/api/v1`;
let failures = 0;

function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
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
const post = (p, o) => req('POST', p, o);
const get = (p, o) => req('GET', p, o);

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
  (await post('/dev/token', { body: { roles, customerId } })).json?.token;
const registerCustomer = async (label) =>
  (await post('/customers', { body: { legalName: label, email: `${label}${Date.now()}@ex.com` } }))
    .json?.id;

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEATURE_SATELLITE_NODES: 'true' },
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));
  const prisma = new PrismaClient();

  try {
    if (!(await waitForHealth())) {
      console.error('API did not start:\n' + logs.join(''));
      process.exit(1);
    }

    // ---- seed node config + a central Listing attributed to the LK node ----
    const localId = randomUUID();
    await prisma.marketNode.createMany({
      data: [
        {
          id: localId,
          code: 'LK',
          name: 'Singha Sri Lanka',
          mode: 'LOCAL_COMMERCE',
          canOriginateListings: true,
          canTakeOffers: true,
          verification: 'verified',
          defaultCurrency: 'LKR',
          defaultLanguage: 'si',
          defaultLocationCountry: 'LK',
        },
        {
          id: randomUUID(),
          code: 'AU',
          name: 'Singha Australia',
          mode: 'DISCOVERY',
          verification: 'verified',
        },
        {
          id: randomUUID(),
          code: 'IN',
          name: 'Singha India',
          mode: 'LOCAL_COMMERCE',
          canOriginateListings: true,
          verification: 'draft',
        },
        {
          id: randomUUID(),
          code: 'SG',
          name: 'Singha Singapore',
          mode: 'LOCAL_COMMERCE',
          canOriginateListings: false,
          verification: 'verified',
        },
      ],
    });
    const assetId = randomUUID();
    await prisma.asset.create({ data: { id: assetId, category: 'produce' } });
    await prisma.listing.create({
      data: {
        id: randomUUID(),
        assetId,
        saleMethod: 'BUY_NOW',
        publicRef: 'LOT-LK-1',
        title: 'Red Onion 10MT',
        currency: 'LKR',
        originNodeId: localId,
      },
    });

    const operator = await token(['auction_staff'], await registerCustomer('nodeOp'));
    const buyer = await token(['customer'], await registerCustomer('nodeBuyer'));

    // ---- node resolution ----
    const lk = await get('/nodes/LK');
    check(
      lk.status === 200 &&
        lk.json?.mode === 'LOCAL_COMMERCE' &&
        lk.json?.presets?.currency === 'LKR',
      'node resolves mode + presets',
    );
    check(lk.json?.capabilities?.originateListings === true, 'node capabilities resolved');
    const missing = await get('/nodes/ZZ');
    check(missing.status === 404, `unknown node -> 404 (got ${missing.status})`);

    // ---- origination gating (the invariant) ----
    const disco = await post('/nodes/AU/originate', {
      token: operator,
      body: { capability: 'listings' },
    });
    check(disco.json?.outcome === 'DISCOVERY_ONLY', 'Discovery node originates nothing');
    const draft = await post('/nodes/IN/originate', {
      token: operator,
      body: { capability: 'listings' },
    });
    check(
      draft.json?.outcome === 'MANUAL_REVIEW_REQUIRED',
      'unverified Local Commerce node -> MANUAL_REVIEW_REQUIRED',
    );
    const nocap = await post('/nodes/SG/originate', {
      token: operator,
      body: { capability: 'listings' },
    });
    check(nocap.json?.outcome === 'CAPABILITY_DISABLED', 'disabled capability refused');
    const allowed = await post('/nodes/LK/originate', {
      token: operator,
      body: { capability: 'listings' },
    });
    check(
      allowed.json?.outcome === 'ALLOWED' && allowed.json?.originNode === 'LK',
      'verified enabled node may originate (attribution)',
    );
    const buyerOrig = await post('/nodes/LK/originate', {
      token: buyer,
      body: { capability: 'listings' },
    });
    check(buyerOrig.status === 403, `non-operator originate -> 403 (got ${buyerOrig.status})`);

    // ---- Discovery reads the SAME central canonical record (no per-country ledger) ----
    const discovery = await get('/nodes/LK/discovery');
    check(
      discovery.json?.source === 'central' &&
        discovery.json?.listings?.some((l) => l.publicRef === 'LOT-LK-1'),
      'node-originated listing is retrievable as the same central canonical record',
    );

    // ---- SEO: canonical strips display currency + tracking ----
    const canon = await post('/seo/canonical', {
      body: {
        baseUrl: 'https://singha.example',
        path: '/lot/lot-lk-1',
        params: { displayCurrency: 'USD', utm_source: 'fb', sort: 'price' },
        locales: ['en', 'si'],
      },
    });
    check(
      canon.json?.canonical === 'https://singha.example/lot/lot-lk-1?sort=price',
      'canonical strips display currency + tracking (one URL per listing)',
    );
    check(
      canon.json?.alternates?.some((a) => a.hreflang === 'x-default'),
      'hreflang alternates include x-default',
    );

    // ---- SEO: deterministic JSON-LD ----
    const ld = await post('/seo/listing-jsonld', {
      body: {
        baseUrl: 'https://singha.example',
        path: '/lot/lot-lk-1',
        publicRef: 'LOT-LK-1',
        title: 'Red Onion 10MT',
        category: 'produce',
        priceMinor: 123450,
        currency: 'USD',
      },
    });
    check(
      ld.json?.jsonLd?.['@type'] === 'Product' && ld.json?.jsonLd?.offers?.price === '1234.50',
      'listing JSON-LD is a schema.org Product with an exact Offer price',
    );

    // ---- DB: origination attribution persisted (audit, not a ledger) ----
    const origins = await prisma.nodeOrigination.findMany();
    check(origins.length >= 4, `node origination audit rows persisted (${origins.length})`);
    const central = await prisma.listing.findFirst({ where: { originNodeId: localId } });
    check(
      central?.publicRef === 'LOT-LK-1',
      'the canonical Listing carries origin-node attribution',
    );
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} node E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll satellite-node / SEO E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
