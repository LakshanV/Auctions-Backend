#!/usr/bin/env node
/**
 * Phase 2 auction E2E (docs/07 gate: concurrency + soft-close). Boots the built
 * API against DATABASE_URL, then proves: proxy bidding, permission enforcement,
 * SERIALIZED concurrent bids (a row-locked burst yields exactly one accepted
 * price move — no lost updates / duplicate ledger rows), soft-close extension,
 * winner + reserve logic, and append-only bid/audit + outbox events.
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

async function token(roles, customerId) {
  return (await post('/dev/token', { body: { roles, customerId } })).json?.token;
}

async function registerCustomer(label) {
  const r = await post('/customers', {
    body: { legalName: label, email: `${label}${Date.now()}@ex.com` },
  });
  return r.json?.id;
}

async function makeListing(sellerToken) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Hilux', year: 2020 } },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: {
      assetId: asset.json.id,
      saleMethod: 'TIMED_AUCTION',
      publicRef: `LOT-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    },
  });
  return listing.json.id;
}

async function configureAuction(staffToken, listingId, over = {}) {
  const now = Date.now();
  const r = await post('/auctions', {
    token: staffToken,
    body: {
      listingId,
      startsAt: new Date(now - 1000).toISOString(),
      endsAt: new Date(now + 5 * 60_000).toISOString(),
      openingBidMinor: 100_000,
      incrementMinor: 10_000,
      reserveMinor: 300_000,
      ...over,
    },
  });
  return r.json?.id;
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
    const bidderA = await registerCustomer('bidderA');
    const bidderB = await registerCustomer('bidderB');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff']);
    const tokenA = await token(['customer'], bidderA);
    const tokenB = await token(['customer'], bidderB);
    const noRole = await token([], bidderA);

    const listingId = await makeListing(sellerToken);
    const auctionId = await configureAuction(staffToken, listingId);
    check(Boolean(auctionId), 'staff configured auction');
    check(
      (await post(`/auctions/${auctionId}/open`, { token: staffToken })).status === 201,
      'staff opened auction',
    );

    // Permission: a token without bid:place is rejected.
    const denied = await post(`/auctions/${auctionId}/bids`, {
      token: noRole,
      body: { maxAmountMinor: 200_000 },
    });
    check(denied.status === 403, `bid without permission -> 403 (got ${denied.status})`);

    // Bidder A sets a high proxy max — sits at the opening bid, leads.
    const a1 = await post(`/auctions/${auctionId}/bids`, {
      token: tokenA,
      body: { maxAmountMinor: 1_000_000 },
    });
    check(
      a1.status === 201 && a1.json?.youLead === true && a1.json?.currentBidMinor === 100_000,
      `A leads at opening (${a1.json?.currentBidMinor}, lead=${a1.json?.youLead})`,
    );

    // Concurrency: a burst of identical B bids must yield EXACTLY ONE accepted
    // price move (serialized by the row lock); the rest fall below the new minimum.
    const burst = await Promise.all(
      Array.from({ length: 8 }, () =>
        post(`/auctions/${auctionId}/bids`, { token: tokenB, body: { maxAmountMinor: 500_000 } }),
      ),
    );
    const accepted = burst.filter((r) => r.status === 201).length;
    const rejected = burst.filter((r) => r.status === 400).length;
    const server5xx = burst.filter((r) => r.status >= 500).length;
    check(accepted === 1, `concurrent burst: exactly 1 accepted (got ${accepted})`);
    check(rejected === 7, `concurrent burst: 7 below-minimum rejects (got ${rejected})`);
    check(server5xx === 0, `concurrent burst: no server errors (got ${server5xx})`);

    const afterBurst = await get(`/auctions/${auctionId}/state`);
    check(
      afterBurst.json?.currentBidMinor === 510_000,
      `price after burst = 510000 (got ${afterBurst.json?.currentBidMinor})`,
    );
    check(afterBurst.json?.bidCount === 2, `ledger has 2 rows (got ${afterBurst.json?.bidCount})`);

    // Proxy: a higher B max still cannot beat A's larger hidden max.
    const b2 = await post(`/auctions/${auctionId}/bids`, {
      token: tokenB,
      body: { maxAmountMinor: 600_000 },
    });
    check(
      b2.status === 201 && b2.json?.youLead === false && b2.json?.currentBidMinor === 610_000,
      `B outbid by A's proxy at 610000 (${b2.json?.currentBidMinor}, lead=${b2.json?.youLead})`,
    );

    // Close: reserve met (610000 ≥ 300000) → sold to A.
    const closed = await post(`/auctions/${auctionId}/close`, { token: staffToken });
    check(
      closed.status === 201 &&
        closed.json?.status === 'closed' &&
        closed.json?.winnerCustomerId === bidderA,
      `auction sold to A (status=${closed.json?.status}, winner=${closed.json?.winnerCustomerId === bidderA})`,
    );

    // Soft close: a bid inside the trigger window pushes the end time out.
    const scListing = await makeListing(sellerToken);
    const scId = await configureAuction(staffToken, scListing, {
      endsAt: new Date(Date.now() + 8_000).toISOString(),
      softCloseTriggerSec: 10,
      softCloseExtendSec: 20,
    });
    await post(`/auctions/${scId}/open`, { token: staffToken });
    const before = new Date((await get(`/auctions/${scId}/state`)).json.endsAt).getTime();
    await post(`/auctions/${scId}/bids`, { token: tokenA, body: { maxAmountMinor: 200_000 } });
    const scState = await get(`/auctions/${scId}/state`);
    check(
      new Date(scState.json.endsAt).getTime() > before && scState.json.extendedCount >= 1,
      `soft close extended end time (+${(new Date(scState.json.endsAt).getTime() - before) / 1000}s, count=${scState.json.extendedCount})`,
    );

    // Reserve NOT met → passed in (no sale).
    const prListing = await makeListing(sellerToken);
    const prId = await configureAuction(staffToken, prListing, { reserveMinor: 900_000 });
    await post(`/auctions/${prId}/open`, { token: staffToken });
    await post(`/auctions/${prId}/bids`, { token: tokenA, body: { maxAmountMinor: 200_000 } });
    // B outbids A here (higher max takes the lead) → A receives BIDDER_OUTBID;
    // price (210000) is still below the 900000 reserve, so it passes in.
    await post(`/auctions/${prId}/bids`, { token: tokenB, body: { maxAmountMinor: 500_000 } });
    const passedIn = await post(`/auctions/${prId}/close`, { token: staffToken });
    check(
      passedIn.json?.status === 'closed' && !passedIn.json?.winnerCustomerId,
      `reserve not met -> passed in (winner=${passedIn.json?.winnerCustomerId ?? 'none'})`,
    );

    // Ledger + events + append-only checks via the database.
    const prisma = new PrismaClient();
    try {
      const events = (await prisma.outboxEvent.findMany({ where: { aggregateId: auctionId } })).map(
        (e) => e.name,
      );
      check(
        events.includes('AUCTION_CLOSED') && events.includes('SALE_CONFIRMED'),
        `outbox has AUCTION_CLOSED + SALE_CONFIRMED (${[...new Set(events)].join(', ')})`,
      );
      check(events.includes('BID_ACCEPTED'), 'outbox has BID_ACCEPTED');
      const prEvents = (await prisma.outboxEvent.findMany({ where: { aggregateId: prId } })).map(
        (e) => e.name,
      );
      check(
        prEvents.includes('BIDDER_OUTBID'),
        `outbox has BIDDER_OUTBID on lead change (${[...new Set(prEvents)].join(', ')})`,
      );

      const seqs = (
        await prisma.bid.findMany({ where: { auctionId }, orderBy: { sequence: 'asc' } })
      ).map((b) => b.sequence);
      check(
        JSON.stringify(seqs) === JSON.stringify([1, 2, 3]),
        `bid sequences are unique & gapless [1,2,3] (got [${seqs.join(',')}])`,
      );

      const firstBid = await prisma.bid.findFirst({ where: { auctionId } });
      let blocked = false;
      try {
        await prisma.bid.update({ where: { id: firstBid.id }, data: { amountMinor: 1 } });
      } catch {
        blocked = true;
      }
      check(blocked, 'bid ledger UPDATE rejected (append-only)');
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} auction E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll auction E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
