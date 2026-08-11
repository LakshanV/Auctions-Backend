#!/usr/bin/env node
/**
 * Stabilisation & Security Pack — negative security regression suite.
 * Boots the real API against an ephemeral Postgres and drives the P0 security
 * matrix (S01–S23, the DB-backed rows). Supabase-issuer rows (S16–S19) and the
 * frontend rows (S08 fake-media, S20 stream-token) are covered by unit tests and
 * frontend code respectively; see STABILISATION_RELEASE_REPORT.md.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import PrismaPkg from '@prisma/client';

const { PrismaClient } = PrismaPkg;
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

const token = async (roles, customerId, aal = 'aal2') =>
  (await v1('/dev/token', { method: 'POST', body: { roles, customerId, aal } })).json?.token;
const registerCustomer = async (label) =>
  (
    await v1('/customers', {
      method: 'POST',
      body: { legalName: label, email: `${label}${Date.now()}${Math.random()}@ex.com` },
    })
  ).json?.id;

async function createListing(sellerToken, category, saleMethod, title) {
  const asset = await v1('/assets', {
    token: sellerToken,
    method: 'POST',
    body: { category, attributes: { make: 'Toyota', model: 'Vitz', year: 2016 } },
  });
  const listing = await v1('/listings', {
    token: sellerToken,
    method: 'POST',
    body: {
      assetId: asset.json.id,
      saleMethod,
      title,
      publicRef: `SEC-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    },
  });
  return { assetId: asset.json.id, listingId: listing.json.id };
}

async function publish(ids, sellerToken, staffToken) {
  await v1(`/listings/${ids.listingId}/submit`, { token: sellerToken, method: 'POST' });
  await v1(`/listings/${ids.listingId}/review`, {
    token: staffToken,
    method: 'POST',
    body: { decision: 'approve' },
  });
  await v1(`/listings/${ids.listingId}/publish`, { token: staffToken, method: 'POST' });
}

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
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

    const sellerAId = await registerCustomer('sellerA');
    const sellerBId = await registerCustomer('sellerB');
    const buyerId = await registerCustomer('buyer');
    const sellerA = await token(['seller'], sellerAId);
    const sellerB = await token(['seller'], sellerBId);
    const staff = await token(['auction_staff'], sellerAId); // aal2
    const staffAal1 = await token(['auction_staff'], sellerAId, 'aal1');
    const buyer = await token(['customer'], buyerId);

    // A published (public) auction lot owned by sellerA, and an unpublished draft.
    const pub = await createListing(sellerA, 'vehicles', 'TIMED_AUCTION', 'Public Vitz');
    await publish(pub, sellerA, staff);
    const draft = await createListing(sellerA, 'vehicles', 'TIMED_AUCTION', 'Secret Draft');

    // --- S01 / S02: public single-lot privacy ---
    const draftAnon = await v2(`/catalogue/${draft.listingId}`);
    check(draftAnon.status === 404, `S01 anon fetch of draft lot → 404 (got ${draftAnon.status})`);
    const pubAnon = await v2(`/catalogue/${pub.listingId}`);
    check(pubAnon.status === 200, `S02 anon fetch of published lot → 200 (got ${pubAnon.status})`);

    // --- S03 / S04 / S09: public media readiness + visibility filter ---
    const media = (over) => ({
      id: randomUUID(),
      assetId: pub.assetId,
      kind: 'image',
      storageKey: `assets/${pub.assetId}/${randomUUID()}.jpg`,
      status: 'ready',
      isOriginal: true,
      visibility: 'public',
      ...over,
    });
    const publicReady = media({ sortOrder: 5 });
    await prisma.mediaObject.create({ data: publicReady });
    await prisma.mediaObject.create({
      data: media({ visibility: 'private', isCover: true, sortOrder: 1 }),
    }); // private but flagged cover
    await prisma.mediaObject.create({
      data: media({ status: 'processing', isCover: true, sortOrder: 2 }),
    }); // processing, flagged cover
    await prisma.mediaObject.create({
      data: media({ kind: 'document', visibility: 'private', sortOrder: 3 }),
    }); // private ownership doc

    // Cover surfaces on the catalogue CARD (list endpoint); the detail `media`
    // field is the gallery array.
    const cards = await v2(`/catalogue?category=vehicles&limit=50`);
    const card = (cards.json?.items ?? []).find((i) => i.id === pub.listingId);
    const cover = card?.media?.cover;
    check(
      cover?.id === publicReady.id,
      `S03/S04 card cover is the public-ready image, never the private/processing one flagged cover (got ${cover?.id})`,
    );
    check(
      card?.media?.videoAvailable === false,
      'S03/S04 videoAvailable stays false when no public-ready video exists',
    );
    const detail = await v2(`/catalogue/${pub.listingId}`);
    const gallery = Array.isArray(detail.json?.media) ? detail.json.media : [];
    const galleryIds = gallery.map((m) => m.id);
    check(
      galleryIds.includes(publicReady.id) && galleryIds.length === 1,
      `S03/S09 gallery contains only public-ready visual media, no private/processing/doc (ids: ${galleryIds.join(',')})`,
    );

    // --- S05 / S06: cross-seller media IDOR ---
    const uploadB = await v1(`/assets/${pub.assetId}/media/upload-url`, {
      token: sellerB,
      method: 'POST',
      body: { filename: 'x.jpg', kind: 'image' },
    });
    check(
      uploadB.status === 403,
      `S05 seller B upload-url on seller A asset → 403 (got ${uploadB.status})`,
    );
    const registerB = await v1(`/assets/${pub.assetId}/media`, {
      token: sellerB,
      method: 'POST',
      body: { kind: 'image', storageKey: `assets/${pub.assetId}/${randomUUID()}.jpg` },
    });
    check(
      registerB.status === 403,
      `S06 seller B register media on seller A asset → 403 (got ${registerB.status})`,
    );

    // --- S07: arbitrary / foreign storage key rejected, no READY row ---
    const evilKey = 'assets/some-other-asset/evil.jpg';
    const evil = await v1(`/assets/${pub.assetId}/media`, {
      token: sellerA,
      method: 'POST',
      body: { kind: 'image', storageKey: evilKey },
    });
    check(
      evil.status >= 400 && evil.status < 500,
      `S07 foreign storageKey rejected (got ${evil.status})`,
    );
    const evilRows = await prisma.mediaObject.count({ where: { storageKey: evilKey } });
    check(evilRows === 0, `S07 no media row created for a rejected key (rows=${evilRows})`);

    // --- S23: finalize is idempotent (re-register same object → same row) ---
    const idempKey = publicReady.storageKey;
    const reReg = await v1(`/assets/${pub.assetId}/media`, {
      token: sellerA,
      method: 'POST',
      body: { kind: 'image', storageKey: idempKey },
    });
    check(
      reReg.status === 200 || reReg.status === 201,
      `S23 re-registering an existing object succeeds (got ${reReg.status})`,
    );
    check(reReg.json?.id === publicReady.id, 'S23 idempotent finalize returns the SAME media id');
    const dupRows = await prisma.mediaObject.count({ where: { storageKey: idempKey } });
    check(dupRows === 1, `S23 no duplicate media row (rows=${dupRows})`);

    // --- S10 / S11: AAL2 enforcement on listing publish ---
    const pubTarget = await createListing(sellerA, 'vehicles', 'TIMED_AUCTION', 'AAL Lot');
    await v1(`/listings/${pubTarget.listingId}/submit`, { token: sellerA, method: 'POST' });
    await v1(`/listings/${pubTarget.listingId}/review`, {
      token: staff,
      method: 'POST',
      body: { decision: 'approve' },
    });
    const pubAal1 = await v1(`/listings/${pubTarget.listingId}/publish`, {
      token: staffAal1,
      method: 'POST',
    });
    check(
      pubAal1.status === 403 && pubAal1.json?.code === 'MFA_REQUIRED',
      `S10 AAL1 staff publish → 403 MFA_REQUIRED (got ${pubAal1.status}/${pubAal1.json?.code})`,
    );
    const pubAal2 = await v1(`/listings/${pubTarget.listingId}/publish`, {
      token: staff,
      method: 'POST',
    });
    check(
      pubAal2.status === 200 || pubAal2.status === 201,
      `S11 AAL2 staff publish → allowed (got ${pubAal2.status})`,
    );

    // --- S12: AAL2 enforcement on payment verification (guard fires before service) ---
    const accountsAal1 = await token(['accounts'], undefined, 'aal1');
    const accountsAal2 = await token(['accounts'], undefined, 'aal2');
    const verifyAal1 = await v1(`/commerce/payments/${randomUUID()}/verify`, {
      token: accountsAal1,
      method: 'POST',
      body: { reference: 'r' },
    });
    check(
      verifyAal1.status === 403 && verifyAal1.json?.code === 'MFA_REQUIRED',
      `S12 AAL1 accounts verify payment → 403 MFA_REQUIRED (got ${verifyAal1.status}/${verifyAal1.json?.code})`,
    );
    const verifyAal2 = await v1(`/commerce/payments/${randomUUID()}/verify`, {
      token: accountsAal2,
      method: 'POST',
      body: { reference: 'r' },
    });
    check(
      verifyAal2.json?.code !== 'MFA_REQUIRED',
      `S12 AAL2 accounts passes the MFA gate (got ${verifyAal2.status}/${verifyAal2.json?.code})`,
    );

    // --- S22: cross-seller listing edit ---
    const editB = await v1(`/listings/${pub.listingId}/content`, {
      token: sellerB,
      method: 'PATCH',
      body: { shortDescription: 'hacked' },
    });
    check(editB.status === 403, `S22 seller B edits seller A listing → 403 (got ${editB.status})`);

    // --- S21: public auction state carries no bidder identity / proxy maxima ---
    const auction = await v1('/auctions', {
      token: staff,
      method: 'POST',
      body: {
        listingId: pub.listingId,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        openingBidMinor: 1_000_000,
        incrementMinor: 25_000,
      },
    });
    await v1(`/auctions/${auction.json.id}/open`, { token: staff, method: 'POST' });
    await v1(`/auctions/${auction.json.id}/bids`, {
      token: buyer,
      method: 'POST',
      body: { amountMinor: 1_500_000, maxProxyMinor: 3_000_000 },
    });
    const state = await v1(`/auctions/${auction.json.id}/state`);
    const stateStr = JSON.stringify(state.json ?? {});
    check(
      state.status === 200 &&
        !/proxy/i.test(stateStr) &&
        !/customerId/i.test(stateStr) &&
        !/reserveMinor/i.test(stateStr),
      `S21 public auction state leaks no proxy/bidder/reserve (${stateStr.slice(0, 120)})`,
    );
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} security E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll security E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
