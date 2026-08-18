#!/usr/bin/env node
/**
 * Seller Studio persistence E2E (directive §25 / §7). Proves:
 *  - server-resumable drafts: create → save (version increments) → stale-version save → 409
 *    conflict → list (owner-scoped) → get → archive (drops from the active list);
 *  - a draft is owner-private (a different seller cannot read it → 404);
 *  - requested auction preferences persist structurally per listing and are owner-scoped
 *    (a different seller setting a pref on someone else's listing → 403).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
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
const put = (p, o) => req('PUT', p, o);
const del = (p, o) => req('DELETE', p, o);

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

    const sellerAId = await registerCustomer('studio-seller-a');
    const sellerBId = await registerCustomer('studio-seller-b');
    const sellerA = await token(['seller'], sellerAId);
    const sellerB = await token(['seller'], sellerBId);

    console.log('Drafts (§25) — resumable, owner-scoped, conflict-handled');
    const created = await post('/seller/drafts', {
      token: sellerA,
      body: { title: 'My Hilux', payload: { category: 'vehicles', step: 3 } },
    });
    check(created.status === 201, `create draft -> 201 (got ${created.status})`);
    const draftId = created.json?.id;
    check(created.json?.version === 1, `new draft is v1 (got ${created.json?.version})`);

    const saved = await put(`/seller/drafts/${draftId}`, {
      token: sellerA,
      body: { title: 'My Hilux', payload: { category: 'vehicles', step: 5 }, expectedVersion: 1 },
    });
    check(
      saved.json?.version === 2,
      `save with expectedVersion 1 -> v2 (got ${saved.json?.version})`,
    );
    check(saved.json?.payload?.step === 5, 'payload persisted (step=5)');

    const stale = await put(`/seller/drafts/${draftId}`, {
      token: sellerA,
      body: { payload: { step: 9 }, expectedVersion: 1 },
    });
    check(stale.status === 409, `stale expectedVersion -> 409 conflict (got ${stale.status})`);

    const otherRead = await get(`/seller/drafts/${draftId}`, { token: sellerB });
    check(
      otherRead.status === 404,
      `a different seller cannot read the draft -> 404 (got ${otherRead.status})`,
    );

    const list = await get('/seller/drafts', { token: sellerA });
    check(
      Array.isArray(list.json?.drafts) && list.json.drafts.length === 1,
      `owner list shows exactly 1 active draft (got ${list.json?.drafts?.length})`,
    );

    const archived = await del(`/seller/drafts/${draftId}`, { token: sellerA });
    check(archived.status === 200, `archive draft -> 200 (got ${archived.status})`);
    const listAfter = await get('/seller/drafts', { token: sellerA });
    check(listAfter.json?.drafts?.length === 0, 'archived draft drops from the active list');

    console.log('Auction preferences (§7) — structural, owner-scoped');
    const asset = await post('/assets', {
      token: sellerA,
      body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Hilux', year: 2019 } },
    });
    const listing = await post('/listings', {
      token: sellerA,
      body: {
        assetId: asset.json?.id,
        saleMethod: 'TIMED_AUCTION',
        title: 'Hilux',
        publicRef: `STU-${Date.now()}`,
      },
    });
    const listingId = listing.json?.id;
    check(!!listingId, `sellerA created listing (${listingId})`);

    const setPref = await put(`/listings/${listingId}/auction-preference`, {
      token: sellerA,
      body: {
        openingBidMinor: 1_500_000,
        reserveMinor: 2_000_000,
        incrementMinor: 50_000,
        currency: 'LKR',
        notes: 'prefer weekend close',
      },
    });
    check(setPref.status === 200, `set auction preference -> 200 (got ${setPref.status})`);
    check(setPref.json?.openingBidMinor === 1_500_000, 'openingBidMinor persisted');
    check(
      setPref.json?.status === 'requested',
      'preference stored as a requested (staff-approvable) record',
    );

    const getPref = await get(`/listings/${listingId}/auction-preference`, { token: sellerA });
    check(getPref.json?.reserveMinor === 2_000_000, 'preference reads back (reserveMinor)');

    const foreign = await put(`/listings/${listingId}/auction-preference`, {
      token: sellerB,
      body: { openingBidMinor: 1 },
    });
    check(
      foreign.status === 403,
      `a different seller cannot set a pref on the listing -> 403 (got ${foreign.status})`,
    );

    // DB corroboration (authoritative state, not just the API echo).
    const row = await prisma.sellerAuctionPreference.findUnique({ where: { listingId } });
    check(
      row && Number(row.openingBidMinor) === 1_500_000 && row.status === 'requested',
      'DB: seller_auction_preference row is authoritative (owner-set, requested)',
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
    child.kill('SIGTERM');
  }

  if (failures > 0) {
    console.error(`\n✗ ${failures} seller-studio check(s) failed`);
    process.exit(1);
  }
  console.log('\n✓ seller-studio E2E passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
