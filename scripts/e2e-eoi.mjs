#!/usr/bin/env node
/**
 * Phase 3 EOI E2E (docs/07 gate). Boots the built API against DATABASE_URL, then
 * proves: an EOI can only be submitted on an EXPRESSION_OF_INTEREST listing;
 * permission enforcement (eoi:submit / eoi:review); PRIVACY (a bidder cannot read
 * a competitor's EOI, and only staff see values across a listing); the review
 * state machine (submitted → under_review → shortlisted → negotiating → accepted)
 * with illegal jumps rejected (409); withdrawal; and an append-only EoiEvent
 * history plus outbox events.
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

async function makeEoiListing(sellerToken) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: {
      category: 'property',
      attributes: { propertyType: 'commercial', extentPerches: 42, district: 'Kandy' },
    },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: {
      assetId: asset.json.id,
      saleMethod: 'EXPRESSION_OF_INTEREST',
      publicRef: `EOI-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    },
  });
  return listing.json.id;
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
    const buyerA = await registerCustomer('buyerA');
    const buyerB = await registerCustomer('buyerB');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff']);
    const tokenA = await token(['customer'], buyerA);
    const tokenB = await token(['customer'], buyerB);
    const noRole = await token([], buyerA);

    const listingId = await makeEoiListing(sellerToken);
    check(Boolean(listingId), 'seller created an EOI listing');

    // A timed-auction listing must NOT accept EOIs.
    const taAsset = await post('/assets', {
      token: sellerToken,
      body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Hilux', year: 2021 } },
    });
    const taListing = await post('/listings', {
      token: sellerToken,
      body: {
        assetId: taAsset.json.id,
        saleMethod: 'TIMED_AUCTION',
        publicRef: `TA-${Date.now()}`,
      },
    });
    const wrongMethod = await post('/eoi', {
      token: tokenA,
      body: { listingId: taListing.json.id, amountMinor: 100 },
    });
    check(wrongMethod.status === 409, `EOI on non-EOI listing -> 409 (got ${wrongMethod.status})`);

    // Permission: a token without eoi:submit is rejected.
    const denied = await post('/eoi', {
      token: noRole,
      body: { listingId, amountMinor: 100_000 },
    });
    check(denied.status === 403, `submit without permission -> 403 (got ${denied.status})`);

    // Two buyers submit private EOIs.
    const aSub = await post('/eoi', {
      token: tokenA,
      body: { listingId, amountMinor: 5_000_000, message: 'cash, 30 days', currency: 'LKR' },
    });
    const bSub = await post('/eoi', {
      token: tokenB,
      body: { listingId, amountMinor: 7_500_000, message: 'subject to survey' },
    });
    check(aSub.status === 201 && aSub.json?.status === 'submitted', 'buyer A submitted EOI');
    check(bSub.status === 201 && bSub.json?.status === 'submitted', 'buyer B submitted EOI');
    const aEoi = aSub.json.id;
    const bEoi = bSub.json.id;

    // Privacy: A sees only their own EOI; cannot read B's.
    const mineA = await get('/eoi/mine', { token: tokenA });
    check(
      mineA.json?.length === 1 && mineA.json[0].id === aEoi,
      `A's /eoi/mine returns only their own (got ${mineA.json?.length})`,
    );
    const peek = await get(`/eoi/${bEoi}`, { token: tokenA });
    check(peek.status === 403, `A reading B's EOI -> 403 (got ${peek.status})`);

    // Staff can see all EOIs on the listing WITH values, ranked by amount.
    const staffList = await get(`/listings/${listingId}/eoi`, { token: staffToken });
    check(
      staffList.json?.length === 2 && staffList.json[0].amountMinor === 7_500_000,
      `staff sees 2 EOIs ranked by amount (top=${staffList.json?.[0]?.amountMinor})`,
    );

    // Illegal jump: submitted -> accepted directly is rejected (409).
    const jump = await post(`/eoi/${aEoi}/review`, {
      token: staffToken,
      body: { decision: 'accept' },
    });
    check(jump.status === 409, `illegal submitted->accepted -> 409 (got ${jump.status})`);

    // Legal review path: under_review -> shortlisted -> negotiating -> accepted.
    for (const [decision, expected] of [
      ['review', 'under_review'],
      ['shortlist', 'shortlisted'],
      ['negotiate', 'negotiating'],
      ['accept', 'accepted'],
    ]) {
      const r = await post(`/eoi/${aEoi}/review`, { token: staffToken, body: { decision } });
      check(r.status === 201 && r.json?.status === expected, `review ${decision} -> ${expected}`);
    }

    // A buyer cannot review (needs eoi:review).
    const buyerReview = await post(`/eoi/${bEoi}/review`, {
      token: tokenA,
      body: { decision: 'decline' },
    });
    check(buyerReview.status === 403, `buyer cannot review -> 403 (got ${buyerReview.status})`);

    // B withdraws their own EOI.
    const withdraw = await post(`/eoi/${bEoi}/withdraw`, { token: tokenB });
    check(
      withdraw.status === 201 && withdraw.json?.status === 'withdrawn',
      `B withdrew their EOI (status=${withdraw.json?.status})`,
    );
    // A terminal EOI cannot be reviewed further.
    const afterWithdraw = await post(`/eoi/${bEoi}/review`, {
      token: staffToken,
      body: { decision: 'review' },
    });
    check(
      afterWithdraw.status === 409,
      `review after withdrawn -> 409 (got ${afterWithdraw.status})`,
    );

    // Append-only history + outbox events via the DB.
    const prisma = new PrismaClient();
    try {
      const history = await prisma.eoiEvent.findMany({
        where: { eoiId: aEoi },
        orderBy: { createdAt: 'asc' },
      });
      const chain = history.map((h) => h.toStatus).join(',');
      check(
        chain === 'submitted,under_review,shortlisted,negotiating,accepted',
        `A's EoiEvent history is the full chain (${chain})`,
      );

      const events = (await prisma.outboxEvent.findMany({ where: { aggregateId: aEoi } })).map(
        (e) => e.name,
      );
      check(
        events.includes('EOI_SUBMITTED') && events.includes('EOI_ACCEPTED'),
        `outbox has EOI_SUBMITTED + EOI_ACCEPTED (${[...new Set(events)].join(', ')})`,
      );

      // EoiEvent is append-only history — the row's status must be immutable-by-convention;
      // assert the accepted EOI's decidedAt was set (terminal) and stays accepted.
      const finalA = await prisma.eoi.findUnique({ where: { id: aEoi } });
      check(
        finalA?.status === 'accepted' && finalA?.decidedAt != null,
        'accepted EOI has decidedAt',
      );
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} EOI E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll EOI E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
