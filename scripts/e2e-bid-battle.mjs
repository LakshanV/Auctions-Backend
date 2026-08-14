#!/usr/bin/env node
/**
 * Bid Battle rivalry HTTP E2E (pack doc 05). Proves the read-only, privacy-safe
 * `RivalryView` end-to-end against a real Postgres + the authoritative auction engine:
 *
 *   - the view is derived from the immutable bid ledger (proxy bidding included) and
 *     reflects leader / nearest challenger / lead changes / comeback / active count;
 *   - real bidder identities NEVER leak — every participant is an alias, the caller is
 *     "You", and no bidderId or proxy maximum appears in the payload;
 *   - a read here can never place a bid (there is no write path);
 *   - the surface is gated on `bidBattleV3`: present when ON, 404 when OFF.
 *
 * The flag is process-level, so gating is proven by running the API twice (flag ON, then
 * OFF) against the SAME persisted auction.
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

/** (Re)start the API with an extra env overlay; resolves to the child process. */
async function startApi(extraEnv) {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv },
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));
  if (!(await waitForHealth())) {
    console.error('API did not start:\n' + logs.join(''));
    process.exit(1);
  }
  return child;
}

const stop = (child) =>
  new Promise((resolve) => {
    if (!child) return resolve();
    child.on('exit', resolve);
    child.kill('SIGKILL');
  });

const token = async (roles, customerId) =>
  (await v1('/dev/token', { method: 'POST', body: { roles, customerId } })).json?.token;
const registerCustomer = async (label) =>
  (
    await v1('/customers', {
      method: 'POST',
      body: { legalName: label, email: `${label}${Date.now()}${Math.random()}@ex.com` },
    })
  ).json?.id;

async function seedOpenAuction(sellerToken, staffToken) {
  const asset = await v1('/assets', {
    token: sellerToken,
    method: 'POST',
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Aqua', year: 2019 } },
  });
  const listing = await v1('/listings', {
    token: sellerToken,
    method: 'POST',
    body: {
      assetId: asset.json.id,
      saleMethod: 'TIMED_AUCTION',
      title: 'Bid Battle Lot',
      publicRef: `BB-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
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
  const auction = await v1('/auctions', {
    token: staffToken,
    method: 'POST',
    body: {
      listingId: id,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      openingBidMinor: 100_000,
      incrementMinor: 25_000,
    },
  });
  const auctionId = auction.json.id;
  await v1(`/auctions/${auctionId}/open`, { token: staffToken, method: 'POST' });
  return auctionId;
}

async function main() {
  let child = await startApi({ FEATURE_V3_BID_BATTLE: 'true' });
  let auctionId;
  let ids = [];
  try {
    const sellerId = await registerCustomer('bb-seller');
    const aId = await registerCustomer('bb-A');
    const bId = await registerCustomer('bb-B');
    const cId = await registerCustomer('bb-C');
    ids = [sellerId, aId, bId, cId];
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff'], sellerId);
    const tokA = await token(['customer'], aId);
    const tokB = await token(['customer'], bId);
    const tokC = await token(['customer'], cId);

    auctionId = await seedOpenAuction(sellerToken, staffToken);
    check(Boolean(auctionId), 'seeded + opened a live auction');

    // Proxy-bidding sequence that forces multiple lead changes:
    //   A leads → B takes it → A retakes (comeback) → C takes it.
    await v1(`/auctions/${auctionId}/bids`, {
      token: tokA,
      method: 'POST',
      body: { maxAmountMinor: 200_000 },
    });
    await v1(`/auctions/${auctionId}/bids`, {
      token: tokB,
      method: 'POST',
      body: { maxAmountMinor: 300_000 },
    });
    await v1(`/auctions/${auctionId}/bids`, {
      token: tokA,
      method: 'POST',
      body: { maxAmountMinor: 500_000 },
    });
    await v1(`/auctions/${auctionId}/bids`, {
      token: tokC,
      method: 'POST',
      body: { maxAmountMinor: 700_000 },
    });

    // --- Viewer = A (the nearest challenger after C takes the lead) ---------------
    const asA = await v1(`/auctions/${auctionId}/rivalry`, { token: tokA });
    check(
      asA.status === 200 && asA.json?.auctionId === auctionId,
      'rivalry view returned when flag ON',
    );
    const v = asA.json;
    check(v.activeBidderCount === 3, `active bidder count = 3 (got ${v.activeBidderCount})`);
    check(v.leadChanges >= 2, `multiple lead changes recorded (got ${v.leadChanges})`);
    check(v.youAreLeading === false, 'viewer A is not leading (C leads)');
    check(
      typeof v.leader === 'string' && v.leader !== 'You',
      `leader is an alias, not the viewer (${v.leader})`,
    );
    check(
      v.challenger === 'You',
      `nearest challenger is the viewer -> "You" (got ${v.challenger})`,
    );
    check(
      v.currentHighMinor != null && v.nextValidBidMinor === v.currentHighMinor + v.gapToNextMinor,
      `next valid bid = high + increment (${v.currentHighMinor}+${v.gapToNextMinor})`,
    );
    check(
      Array.isArray(v.moments) && v.moments.some((m) => m.kind === 'you_outbid'),
      'viewer sees a "you were outbid" moment',
    );
    check(
      v.moments.some((m) => m.kind === 'comeback' && m.who === 'You'),
      'viewer sees their own comeback moment',
    );

    // --- No identity/PII leakage --------------------------------------------------
    const json = JSON.stringify(v);
    check(
      ids.every((id) => !json.includes(id)),
      'no bidderId / customerId appears anywhere in the payload',
    );
    check(
      !['bidderId', 'maxMinor', 'proxy', 'maxAmount'].some((k) => json.includes(`"${k}"`)),
      'no proxy-maximum or bidderId field is exposed',
    );

    // --- Viewer = C (the current leader) -> "You" leads ---------------------------
    const asC = await v1(`/auctions/${auctionId}/rivalry`, { token: tokC });
    check(
      asC.json?.youAreLeading === true && asC.json?.leader === 'You',
      'leader sees themselves as "You"',
    );

    // --- Anonymous spectator: aliases only, never "You" ---------------------------
    const anon = await v1(`/auctions/${auctionId}/rivalry`);
    check(
      anon.status === 200 && anon.json?.youAreLeading === false && anon.json?.leader !== 'You',
      'anonymous spectator sees aliases only',
    );

    // --- Aliases are stable across reads (same auction) ---------------------------
    const asA2 = await v1(`/auctions/${auctionId}/rivalry`, { token: tokA });
    check(asA2.json?.leader === v.leader, 'aliases are stable across repeated reads');
  } finally {
    await stop(child);
  }

  // --- Flag OFF: the surface must not exist (404), same persisted auction --------
  child = await startApi({ FEATURE_V3_BID_BATTLE: 'false' });
  try {
    const off = await v1(`/auctions/${auctionId}/rivalry`);
    check(
      off.status === 404,
      `rivalry endpoint is 404 when bidBattleV3 is OFF (got ${off.status})`,
    );
    // The authoritative auction itself is still readable — only the V3 surface is gated.
    const state = await v1(`/auctions/${auctionId}/state`);
    check(state.status === 200, 'the auction state endpoint is unaffected by the flag');
  } finally {
    await stop(child);
  }

  if (failures > 0) {
    console.error(`\n${failures} bid-battle E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll Bid Battle rivalry E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
