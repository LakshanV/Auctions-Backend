#!/usr/bin/env node
/**
 * Alignment increment 3 E2E (consolidated pack doc 06): listing public-content /
 * sale-config editing and Auction Events. Proves: a seller edits descriptions +
 * guide price (reflected in the v2 card), only STAFF can set `featured`, and
 * staff can build a multi-lot event whose public page lists its ordered lots.
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
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff'], sellerId);

    // Seller creates + publishes an EOI listing (owned by the seller).
    const asset = await v1('/assets', {
      token: sellerToken,
      method: 'POST',
      body: {
        category: 'property',
        attributes: { propertyType: 'commercial', district: 'Colombo' },
        ownerCustomerId: sellerId,
      },
    });
    const listing = await v1('/listings', {
      token: sellerToken,
      method: 'POST',
      body: {
        assetId: asset.json.id,
        saleMethod: 'EXPRESSION_OF_INTEREST',
        title: 'Prime Commercial Land',
        publicRef: `EC-${Date.now()}`,
      },
    });
    const listingId = listing.json.id;
    await v1(`/listings/${listingId}/submit`, { token: sellerToken, method: 'POST' });
    await v1(`/listings/${listingId}/review`, {
      token: staffToken,
      method: 'POST',
      body: { decision: 'approve' },
    });
    await v1(`/listings/${listingId}/publish`, { token: staffToken, method: 'POST' });

    // Seller edits public content + guide price; featured is ignored for seller.
    const sellerEdit = await v1(`/listings/${listingId}/content`, {
      token: sellerToken,
      method: 'PATCH',
      body: {
        shortDescription: 'Rare 42-perch commercial plot',
        locationCity: 'Colombo',
        guidePriceMinor: 96_000_000,
        showGuidePrice: true,
        featured: true,
      },
    });
    check(
      sellerEdit.status === 200 && sellerEdit.json?.showGuidePrice === true,
      'seller set guide price + content',
    );
    check(sellerEdit.json?.featured === false, 'featured NOT set by a seller (staff-only)');

    // Staff sets featured.
    const staffEdit = await v1(`/listings/${listingId}/content`, {
      token: staffToken,
      method: 'PATCH',
      body: { featured: true },
    });
    check(staffEdit.json?.featured === true, 'staff set featured');

    // v2 card reflects guide price, location and featured.
    const cat = await v2('/catalogue?category=property');
    const card = cat.json.items.find((i) => i.id === listingId);
    check(
      card?.commercial?.kind === 'eoi' && card.commercial.guidePriceMinor === 96_000_000,
      `EOI card shows the guide price (${card?.commercial?.guidePriceMinor})`,
    );
    check(
      card?.featured === true && card?.location?.city === 'Colombo',
      'card shows featured + location',
    );

    // A non-owner, non-staff cannot edit content.
    const otherId = await registerCustomer('other');
    const otherSeller = await token(['seller'], otherId);
    const forbidden = await v1(`/listings/${listingId}/content`, {
      token: otherSeller,
      method: 'PATCH',
      body: { shortDescription: 'hijack' },
    });
    check(
      forbidden.status === 403,
      `non-owner seller cannot edit content -> 403 (got ${forbidden.status})`,
    );

    // --- Auction Events ---
    const sellerEvent = await v1('/events', {
      token: sellerToken,
      method: 'POST',
      body: { publicRef: `EV-${Date.now()}`, title: 'x' },
    });
    check(
      sellerEvent.status === 403,
      `seller cannot create an event -> 403 (got ${sellerEvent.status})`,
    );

    const event = await v1('/events', {
      token: staffToken,
      method: 'POST',
      body: {
        publicRef: `EV-${Date.now()}`,
        title: 'Colombo Property Showcase',
        eventType: 'live',
        featured: true,
        locationCity: 'Colombo',
      },
    });
    check(event.status === 201, 'staff created an event');
    const eventId = event.json.id;
    const eventRef = event.json.publicRef;

    const addLot = await v1(`/events/${eventId}/lots`, {
      token: staffToken,
      method: 'POST',
      body: { listingId, sequence: 1, lane: 'A' },
    });
    check(
      addLot.status === 201 && addLot.json?.sequence === 1,
      'lot added to the event at sequence 1',
    );

    // Duplicate sequence rejected.
    const dupSeq = await v1(`/events/${eventId}/lots`, {
      token: staffToken,
      method: 'POST',
      body: { listingId, sequence: 1 },
    });
    check(dupSeq.status === 409, `duplicate lot/sequence -> 409 (got ${dupSeq.status})`);

    await v1(`/events/${eventId}/publish`, { token: staffToken, method: 'POST' });

    // Public event page by publicRef, with ordered lots.
    const page = await v1(`/events/${eventRef}`);
    check(
      page.status === 200 &&
        page.json?.lots?.length === 1 &&
        page.json.lots[0].listingId === listingId,
      'public event page lists the ordered lot',
    );

    // Featured events listing.
    const featured = await v1('/events?featured=true');
    check(
      Array.isArray(featured.json) && featured.json.some((e) => e.id === eventId),
      'featured events listing includes the event',
    );
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} events/content E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll events + content E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
