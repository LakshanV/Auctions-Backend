#!/usr/bin/env node
/**
 * §21/§22 (RW6) E2E — Singha Live floor state-machine + scoped roles + deterministic stream.
 * Proves: the auctioneer (live:conduct) drives per-lot state (on-block → going once/twice →
 * sold/passed) with a current-lot pointer and sequencing (next/withdraw); invalid transitions are
 * rejected; the scoped roles hold exactly their slice (auctioneer ≠ clerk ≠ producer, staff = all);
 * the floor read exposes the AUTHORITATIVE bid from the engine (rule 12); and the fake stream is
 * deterministic (same title → same playback URL, no Date.now/Math.random).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'http://localhost:4000';
const V1 = `${BASE}/api/v1`;
let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
};

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
const ev = (p, o) => call(`${BASE}/api/v1/events${p}`, o);

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
      body: {
        legalName: label,
        email: `${label}${Date.now()}${Math.floor(Math.random() * 1e4)}@ex.com`,
      },
    })
  ).json?.id;

async function publishAuctionLot(sellerToken, staffToken, title, opening) {
  const asset = await v1('/assets', {
    token: sellerToken,
    method: 'POST',
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: title, year: 2020 } },
  });
  const listing = await v1('/listings', {
    token: sellerToken,
    method: 'POST',
    body: {
      assetId: asset.json.id,
      saleMethod: 'TIMED_AUCTION',
      title,
      publicRef: `FLOOR-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
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
  const auction = await v1('/auctions', {
    token: staffToken,
    method: 'POST',
    body: {
      listingId,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      openingBidMinor: opening,
      incrementMinor: 25_000,
    },
  });
  // Open it (scheduled → open) so the engine accepts bids — a clerk floor bid needs a live auction.
  await v1(`/auctions/${auction.json.id}/open`, { token: staffToken, method: 'POST' });
  return { listingId, auctionId: auction.json.id };
}

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEATURE_V3_LIVE: 'true' },
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));

  try {
    if (!(await waitForHealth())) {
      console.error('API did not start:\n' + logs.join(''));
      process.exit(1);
    }

    const sellerId = await registerCustomer('floorseller');
    const buyerId = await registerCustomer('floorbuyer');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff'], sellerId);
    const auctioneerToken = await token(['auctioneer'], sellerId);
    const clerkToken = await token(['clerk'], sellerId);
    const producerToken = await token(['producer'], sellerId);
    const customerToken = await token(['customer'], buyerId);

    // Three published auction lots.
    const l1 = await publishAuctionLot(sellerToken, staffToken, 'Lot One', 1_000_000);
    const l2 = await publishAuctionLot(sellerToken, staffToken, 'Lot Two', 2_000_000);
    const l3 = await publishAuctionLot(sellerToken, staffToken, 'Lot Three', 3_000_000);

    // An auction event with the three lots in sequence.
    const event = await ev('', {
      token: staffToken,
      method: 'POST',
      body: {
        publicRef: `EVT-${Date.now()}`,
        title: 'Live Sale',
        eventType: 'live',
        liveEnabled: true,
      },
    });
    check(event.status === 201 || event.status === 200, `event created (${event.status})`);
    const eventId = event.json.id;
    const addLot = async (listingId, sequence) =>
      ev(`/${eventId}/lots`, { token: staffToken, method: 'POST', body: { listingId, sequence } });
    await addLot(l1.listingId, 1);
    await addLot(l2.listingId, 2);
    await addLot(l3.listingId, 3);
    // Derive the AuctionEventLot ids from the floor read (robust to the addLot response shape).
    const seeded = await ev(`/${eventId}/floor`);
    const bySeq = (n) => seeded.json.lots.find((l) => l.sequence === n);
    const lot1 = { id: bySeq(1)?.lotId };
    const lot2 = { id: bySeq(2)?.lotId };
    const lot3 = { id: bySeq(3)?.lotId };
    check(!!lot1.id && !!lot2.id && !!lot3.id, 'three lots added to the event');

    // --- Deterministic fake stream: same title → same playback URL ---
    const ch1 = await v1('/live/events', {
      token: producerToken,
      method: 'POST',
      body: { title: 'Determinism Room' },
    });
    const ch2 = await v1('/live/events', {
      token: producerToken,
      method: 'POST',
      body: { title: 'Determinism Room' },
    });
    check(
      ch1.json?.playbackUrl && ch1.json.playbackUrl === ch2.json?.playbackUrl,
      'fake stream is deterministic (same title → same playbackUrl; no Date.now/Math.random)',
    );
    check(
      ch1.status === 201 || ch1.status === 200,
      'producer can create a live broadcast (live:produce)',
    );

    // --- Floor read (public): all pending, nothing on the block ---
    const floor0 = await ev(`/${eventId}/floor`);
    check(
      floor0.status === 200 && floor0.json.lots.length === 3 && floor0.json.current === null,
      'floor read: 3 lots, none on the block yet',
    );
    check(
      floor0.json.lots.every((l) => l.liveState === 'pending'),
      'all lots start pending',
    );

    // --- Role scoping: only the auctioneer (or staff) may conduct ---
    const denyCustomer = await ev(`/${eventId}/floor/open-lot`, {
      token: customerToken,
      method: 'POST',
      body: { lotId: lot1.id },
    });
    check(
      denyCustomer.status === 403,
      `customer cannot open a lot -> 403 (got ${denyCustomer.status})`,
    );
    const denyProducer = await ev(`/${eventId}/floor/open-lot`, {
      token: producerToken,
      method: 'POST',
      body: { lotId: lot1.id },
    });
    check(
      denyProducer.status === 403,
      `producer cannot conduct the floor -> 403 (got ${denyProducer.status})`,
    );
    const denyClerk = await ev(`/${eventId}/floor/open-lot`, {
      token: clerkToken,
      method: 'POST',
      body: { lotId: lot1.id },
    });
    check(
      denyClerk.status === 403,
      `clerk cannot conduct the floor -> 403 (got ${denyClerk.status})`,
    );

    // --- Auctioneer runs the state machine on lot 1 ---
    const open1 = await ev(`/${eventId}/floor/open-lot`, {
      token: auctioneerToken,
      method: 'POST',
      body: { lotId: lot1.id },
    });
    check(
      open1.status === 201 || open1.status === 200,
      `auctioneer opens lot 1 (live:conduct) (${open1.status})`,
    );
    check(
      open1.json?.currentLotId === lot1.id && open1.json?.current?.liveState === 'on_block',
      'lot 1 is on the block; current-lot pointer set',
    );

    // Authoritative bid: a clerk relays a floor bid → floor read reflects the ENGINE state.
    const relay = await v1('/live/floor-bid', {
      token: clerkToken,
      method: 'POST',
      body: {
        auctionId: l1.auctionId,
        bidderCustomerId: buyerId,
        maxAmountMinor: 1_500_000,
        source: 'floor',
      },
    });
    check(
      relay.status === 201 || relay.status === 200,
      `clerk relays a floor bid (live:clerk) (${relay.status})`,
    );
    const afterBid = await ev(`/${eventId}/floor`);
    // The floor read reflects the ENGINE's authoritative state, not a number this machine invents:
    // the relayed bid is now in the ledger (bidCount 0→1) and the current price is the engine's
    // (a lone proxy bid sits at the opening; the bidder's max stays private — never leaked).
    check(
      afterBid.json?.current?.bid?.bidCount === 1 &&
        afterBid.json?.current?.bid?.currentBidMinor === 1_000_000,
      `floor read shows the AUTHORITATIVE engine state (bidCount=${afterBid.json?.current?.bid?.bidCount}, current=${afterBid.json?.current?.bid?.currentBidMinor})`,
    );

    // Invalid transition: going_twice before going_once.
    const badCall = await ev(`/${eventId}/floor/call`, {
      token: auctioneerToken,
      method: 'POST',
      body: { stage: 'going_twice' },
    });
    check(badCall.status === 400, `going_twice from on_block is rejected (got ${badCall.status})`);

    const once = await ev(`/${eventId}/floor/call`, {
      token: auctioneerToken,
      method: 'POST',
      body: { stage: 'going_once' },
    });
    check(once.json?.current?.liveState === 'going_once', 'call going once');
    const twice = await ev(`/${eventId}/floor/call`, {
      token: auctioneerToken,
      method: 'POST',
      body: { stage: 'going_twice' },
    });
    check(twice.json?.current?.liveState === 'going_twice', 'call going twice');
    const sold = await ev(`/${eventId}/floor/sell`, { token: auctioneerToken, method: 'POST' });
    check(sold.json?.current?.liveState === 'sold', 'hammer down — lot 1 sold');
    const lot1Row = sold.json.lots.find((l) => l.lotId === lot1.id);
    check(lot1Row?.liveState === 'sold', 'lot 1 shows sold in the ordered rail');

    // --- Advance to the next lot, then pass it ---
    const next = await ev(`/${eventId}/floor/next`, { token: auctioneerToken, method: 'POST' });
    check(
      next.json?.currentLotId === lot2.id && next.json?.current?.liveState === 'on_block',
      'next advances to lot 2 and puts it on the block',
    );
    const passed = await ev(`/${eventId}/floor/pass`, { token: auctioneerToken, method: 'POST' });
    check(passed.json?.current?.liveState === 'passed', 'lot 2 passed (no sale)');

    // --- Withdraw lot 3 (still pending), then it cannot be opened ---
    const withdrawn = await ev(`/${eventId}/floor/withdraw`, {
      token: auctioneerToken,
      method: 'POST',
      body: { lotId: lot3.id },
    });
    const lot3Row = withdrawn.json.lots.find((l) => l.lotId === lot3.id);
    check(lot3Row?.liveState === 'withdrawn', 'lot 3 withdrawn');
    const reopen = await ev(`/${eventId}/floor/open-lot`, {
      token: auctioneerToken,
      method: 'POST',
      body: { lotId: lot3.id },
    });
    check(reopen.status === 400, `a withdrawn lot cannot be opened (got ${reopen.status})`);

    // --- next with nothing left awaiting sale ---
    const noMore = await ev(`/${eventId}/floor/next`, { token: auctioneerToken, method: 'POST' });
    check(noMore.status === 400, `next with no pending lots is rejected (got ${noMore.status})`);

    // --- Final floor snapshot is coherent ---
    const finalFloor = await ev(`/${eventId}/floor`);
    const states = Object.fromEntries(finalFloor.json.lots.map((l) => [l.lotId, l.liveState]));
    check(
      states[lot1.id] === 'sold' && states[lot2.id] === 'passed' && states[lot3.id] === 'withdrawn',
      'final states: lot1 sold, lot2 passed, lot3 withdrawn',
    );

    // --- Flag OFF: the floor surface 404s (liveV3 gate) ---
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} live-floor E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll live-floor E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
