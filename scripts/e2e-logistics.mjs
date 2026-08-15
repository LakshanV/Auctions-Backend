#!/usr/bin/env node
/**
 * Evolution E7 Logistics / Ports / Incoterms E2E (pack doc 10). Boots the built API with
 * FEATURE_LOGISTICS ON (the provider defaults to the credential-free fake), seeds two logistics
 * nodes, and proves:
 *  - the Incoterm taxonomy + node reads;
 *  - a deterministic instant freight estimate (float-free minor units): SEA_FCL 500/unit × 10 ×
 *    250% cross-border = 12,500;
 *  - freight responsibility derives from the Incoterm (FOB→buyer, CIF→seller) unless overridden;
 *  - a quote is NOT a booking — it persists assumptions + provider + an expiry window;
 *  - requesting a quote needs an authenticated participant (anonymous is denied).
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEATURE_LOGISTICS: 'true' },
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

    await prisma.logisticsNode.create({
      data: {
        id: randomUUID(),
        code: 'LKCMB',
        name: 'Colombo Port',
        kind: 'PORT',
        countryCode: 'LK',
      },
    });
    await prisma.logisticsNode.create({
      data: {
        id: randomUUID(),
        code: 'AUSYD',
        name: 'Sydney Port',
        kind: 'PORT',
        countryCode: 'AU',
      },
    });

    const buyer = await token(['customer']);

    // ---- reference reads ----
    const incoterms = await get('/logistics/incoterms');
    const codes = (incoterms.json?.incoterms ?? []).map((i) => i.code);
    check(
      incoterms.status === 200 && codes.includes('FOB') && codes.includes('CIF'),
      'GET /logistics/incoterms lists the Incoterm taxonomy',
    );
    const nodes = await get('/logistics/nodes');
    check(
      nodes.status === 200 && (nodes.json?.nodes ?? []).length >= 2,
      'GET /logistics/nodes lists configured nodes',
    );

    // ---- deterministic instant estimate ----
    const quote = await post('/logistics/quotes', {
      token: buyer,
      body: {
        originNodeCode: 'LKCMB',
        destinationNodeCode: 'AUSYD',
        transportMode: 'SEA_FCL',
        incoterm: 'FOB',
        chargeableUnits: 10,
        currency: 'USD',
      },
    });
    check(
      quote.status === 201 &&
        quote.json?.amountMinor === 12_500 &&
        quote.json?.freightArranger === 'buyer' &&
        quote.json?.status === 'QUOTED' &&
        quote.json?.provider === 'fake',
      'SEA_FCL LK→AU × 10 units = 12,500 (FOB → buyer arranges freight)',
    );
    const quoteId = quote.json?.id;
    check(
      typeof quote.json?.expiresAt === 'string' && quote.json?.expiresAt > quote.json?.quotedAt,
      'a quote is not a booking — it carries assumptions + an expiry window',
    );

    // CIF flips freight responsibility to the seller.
    const cif = await post('/logistics/quotes', {
      token: buyer,
      body: {
        originNodeCode: 'LKCMB',
        destinationNodeCode: 'AUSYD',
        transportMode: 'AIR',
        incoterm: 'CIF',
        chargeableUnits: 2,
        currency: 'USD',
      },
    });
    check(
      cif.json?.freightArranger === 'seller' && cif.json?.amountMinor === 17_500,
      'CIF → seller arranges freight; AIR 3,500 × 2 × 250% = 17,500',
    );

    // ---- read back ----
    const readBack = await get(`/logistics/quotes/${quoteId}`, { token: buyer });
    check(
      readBack.status === 200 && readBack.json?.amountMinor === 12_500,
      'a persisted quote reads back with its exact amount',
    );

    // ---- authorization: anonymous cannot request a quote ----
    const anon = await post('/logistics/quotes', {
      body: {
        originNodeCode: 'LKCMB',
        destinationNodeCode: 'AUSYD',
        transportMode: 'ROAD',
        incoterm: 'EXW',
        chargeableUnits: 1,
        currency: 'USD',
      },
    });
    check([401, 403].includes(anon.status), `anonymous quote request denied (got ${anon.status})`);

    // ---- persistence ----
    const row = await prisma.logisticsQuote.findUnique({ where: { id: quoteId } });
    check(
      row?.provider === 'fake' && Number(row?.amountMinor) === 12_500,
      'quote persisted with provider + exact minor-unit amount',
    );

    // ---- E7b: book a quote → booking + shipment (a quote is not a booking) ----
    const staff = await token(['auction_staff']);
    const booked = await post(`/logistics/quotes/${quoteId}/book`, { token: buyer });
    check(
      booked.status === 201 &&
        booked.json?.status === 'BOOKED' &&
        typeof booked.json?.shipmentId === 'string' &&
        booked.json?.amountMinor === 12_500,
      'booking an accepted quote creates a booking + shipment (snapshots the 12,500 amount)',
    );
    const shipmentId = booked.json?.shipmentId;

    // Re-booking the same quote is refused (a quote books at most once).
    const rebook = await post(`/logistics/quotes/${quoteId}/book`, { token: buyer });
    check(rebook.status === 409, `re-booking a quote -> 409 (got ${rebook.status})`);

    // Shipment starts BOOKED with one timeline event.
    const ship0 = await get(`/logistics/shipments/${shipmentId}`, { token: buyer });
    check(
      ship0.json?.status === 'BOOKED' && (ship0.json?.events ?? []).length === 1,
      'shipment starts BOOKED with a single timeline event',
    );

    // A buyer cannot advance a shipment (operator/carrier action).
    const buyerAdvance = await post(`/logistics/shipments/${shipmentId}/events`, {
      token: buyer,
      body: { type: 'PICKUP', status: 'PICKED_UP' },
    });
    check(
      buyerAdvance.status === 403,
      `buyer cannot advance a shipment -> 403 (got ${buyerAdvance.status})`,
    );

    // Operator advances BOOKED → PICKED_UP → IN_TRANSIT.
    const pick = await post(`/logistics/shipments/${shipmentId}/events`, {
      token: staff,
      body: { type: 'PICKUP', status: 'PICKED_UP', locationCode: 'LKCMB' },
    });
    check(pick.json?.status === 'PICKED_UP', 'operator advances shipment to PICKED_UP');
    const transit = await post(`/logistics/shipments/${shipmentId}/events`, {
      token: staff,
      body: { type: 'DEPART', status: 'IN_TRANSIT' },
    });
    check(transit.json?.status === 'IN_TRANSIT', 'operator advances shipment to IN_TRANSIT');

    // An illegal skip (IN_TRANSIT → DELIVERED) is refused by the lifecycle.
    const skip = await post(`/logistics/shipments/${shipmentId}/events`, {
      token: staff,
      body: { type: 'DELIVER', status: 'DELIVERED' },
    });
    check(
      skip.status === 409,
      `illegal shipment skip IN_TRANSIT→DELIVERED -> 409 (got ${skip.status})`,
    );

    const shipN = await get(`/logistics/shipments/${shipmentId}`, { token: buyer });
    check(
      shipN.json?.status === 'IN_TRANSIT' &&
        shipN.json?.events?.map((e) => e.status).join(',') === 'BOOKED,PICKED_UP,IN_TRANSIT',
      'shipment timeline is append-only (BOOKED → PICKED_UP → IN_TRANSIT)',
    );

    // An expired quote cannot be booked.
    const freshQuote = await post('/logistics/quotes', {
      token: buyer,
      body: {
        originNodeCode: 'LKCMB',
        destinationNodeCode: 'AUSYD',
        transportMode: 'ROAD',
        incoterm: 'EXW',
        chargeableUnits: 5,
        currency: 'USD',
      },
    });
    await prisma.logisticsQuote.update({
      where: { id: freshQuote.json.id },
      data: { expiresAt: new Date('2020-01-01T00:00:00Z') },
    });
    const expiredBook = await post(`/logistics/quotes/${freshQuote.json.id}/book`, {
      token: buyer,
    });
    check(
      expiredBook.status === 409,
      `booking an expired quote -> 409 (got ${expiredBook.status})`,
    );
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} logistics E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll logistics E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
