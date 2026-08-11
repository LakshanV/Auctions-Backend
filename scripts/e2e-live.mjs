#!/usr/bin/env node
/**
 * Phase 11 Singha Live E2E (docs/08 gate: live/hybrid). Proves the broadcast
 * lifecycle (create channel → start → simulcast → stop → recording) via the mock
 * stream adapter, and — critically (rule 12 + docs/07) — that ONLINE and clerk-
 * relayed FLOOR/PHONE bids all flow through the authoritative auction engine
 * into the ONE bid ledger with their true source, the engine still deciding the
 * winner. The stream is a distribution surface, never the source of truth.
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
    const onlineBidder = await registerCustomer('online');
    const floorBidder = await registerCustomer('floor');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff'], sellerId);
    const onlineToken = await token(['customer'], onlineBidder);

    // Set up a LIVE_HYBRID listing + auction.
    const asset = await post('/assets', {
      token: sellerToken,
      body: { category: 'gems', attributes: { type: 'Blue Sapphire', caratWeight: 5.2 } },
    });
    const listing = await post('/listings', {
      token: sellerToken,
      body: { assetId: asset.json.id, saleMethod: 'LIVE_HYBRID', publicRef: `LV-${Date.now()}` },
    });
    const auction = await post('/auctions', {
      token: staffToken,
      body: {
        listingId: listing.json.id,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 120_000).toISOString(),
        openingBidMinor: 5_000_000,
        incrementMinor: 500_000,
      },
    });
    const auctionId = auction.json.id;
    await post(`/auctions/${auctionId}/open`, { token: staffToken });

    // Broadcast lifecycle.
    const permDenied = await post('/live/events', { token: onlineToken, body: { title: 'x' } });
    check(
      permDenied.status === 403,
      `non-staff cannot create a live event -> 403 (got ${permDenied.status})`,
    );

    const event = await post('/live/events', {
      token: staffToken,
      body: { title: 'Gem Showcase', auctionId },
    });
    check(
      event.status === 201 && /m3u8/.test(event.json?.playbackUrl ?? ''),
      'live event created with a playback URL (mock ingest)',
    );
    const eventId = event.json.id;

    const started = await post(`/live/events/${eventId}/start`, { token: staffToken });
    check(started.json?.status === 'live', 'broadcast started');
    const sim = await post(`/live/events/${eventId}/simulcast`, { token: staffToken });
    check(/youtube/.test(sim.json?.simulcastUrl ?? ''), 'YouTube simulcast (mock) started');

    // Public bidder room can read playback state without auth.
    const room = await get(`/live/events/${eventId}`);
    check(
      room.status === 200 && room.json?.status === 'live',
      'public bidder room shows live state',
    );

    // Online bid, then a clerk relays a higher FLOOR bid — both via the engine.
    const online = await post(`/auctions/${auctionId}/bids`, {
      token: onlineToken,
      body: { maxAmountMinor: 6_000_000, source: 'online' },
    });
    check(
      online.json?.currentBidMinor === 5_000_000 && online.json?.youLead === true,
      'online bidder leads at opening',
    );

    const floor = await post('/live/floor-bid', {
      token: staffToken,
      body: {
        auctionId,
        bidderCustomerId: floorBidder,
        maxAmountMinor: 8_000_000,
        source: 'floor',
      },
    });
    check(
      floor.status === 201 && floor.json?.source === 'floor' && floor.json?.youLead === true,
      `clerk-relayed floor bid takes the lead (current=${floor.json?.currentBidMinor})`,
    );

    // Close → floor bidder wins (highest max), decided by the engine.
    const closed = await post(`/auctions/${auctionId}/close`, { token: staffToken });
    check(
      closed.json?.winnerCustomerId === floorBidder,
      'engine awarded the sale to the floor bidder',
    );

    const stopped = await post(`/live/events/${eventId}/stop`, { token: staffToken });
    check(
      stopped.json?.status === 'ended' && /mp4/.test(stopped.json?.recordingUrl ?? ''),
      'broadcast stopped with a recording URL',
    );

    // The ONE ledger holds both sources.
    const prisma = new PrismaClient();
    try {
      const bids = await prisma.bid.findMany({
        where: { auctionId },
        orderBy: { sequence: 'asc' },
      });
      const sources = new Set(bids.map((b) => b.source));
      check(
        sources.has('online') && sources.has('floor'),
        `one ledger holds both online + floor sources (${[...sources].join(', ')})`,
      );
      const sale = await prisma.sale.findUnique({ where: { listingId: listing.json.id } });
      check(
        sale?.channel === 'auction' && sale?.buyerCustomerId === floorBidder,
        'Sale recorded for the live/hybrid auction',
      );
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} live E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll live E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
