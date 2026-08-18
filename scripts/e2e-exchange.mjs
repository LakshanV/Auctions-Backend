#!/usr/bin/env node
/**
 * Phase 3 Exchange E2E (docs/07: Buy Now / Make Offer / Sealed Tender). Boots the
 * built API with the three feature flags ON and proves: Buy Now is atomic (a
 * concurrent double-purchase yields exactly one sale); Make Offer records an
 * append-only counter/accept history and awards a Sale on accept; Sealed Tender
 * keeps values sealed until a controlled staff open, then ranks + awards the
 * highest. Permissions enforced throughout.
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

async function makeListing(sellerToken, saleMethod) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: { category: 'general', attributes: { description: 'lot' } },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: {
      assetId: asset.json.id,
      saleMethod,
      publicRef: `EX-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
    },
  });
  return listing.json.id;
}

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FEATURE_BUY_NOW: 'true',
      FEATURE_MAKE_OFFER: 'true',
      FEATURE_SEALED_TENDER: 'true',
    },
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
    const buyerA = await registerCustomer('exA');
    const buyerB = await registerCustomer('exB');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff']);
    const tokenA = await token(['customer'], buyerA);
    const tokenB = await token(['customer'], buyerB);

    // ---- Buy Now: atomic single sale under a concurrent burst ----
    const bnListing = await makeListing(sellerToken, 'BUY_NOW');
    check(
      (
        await post(`/exchange/listings/${bnListing}/buy-now`, {
          token: tokenA,
          body: {},
        })
      ).status === 409,
      'buy-now before price set -> 409',
    );
    const priced = await post(`/exchange/listings/${bnListing}/buy-now-price`, {
      token: staffToken,
      body: { amountMinor: 2_500_000 },
    });
    check(priced.status === 201, 'staff set buy-now price');

    const burst = await Promise.all(
      [tokenA, tokenB, tokenA, tokenB, tokenA, tokenB].map((t) =>
        post(`/exchange/listings/${bnListing}/buy-now`, { token: t, body: {} }),
      ),
    );
    const sold = burst.filter((r) => r.status === 201).length;
    const rejected = burst.filter((r) => r.status === 409).length;
    check(sold === 1, `buy-now burst: exactly 1 sale (got ${sold})`);
    check(rejected === 5, `buy-now burst: 5 rejected as already-sold (got ${rejected})`);

    // ---- Make Offer: counter → accept awards a Sale ----
    const moListing = await makeListing(sellerToken, 'MAKE_OFFER');
    const offer = await post(`/exchange/listings/${moListing}/offers`, {
      token: tokenA,
      body: { amountMinor: 1_000_000, note: 'opening offer' },
    });
    check(offer.status === 201 && offer.json?.status === 'open', 'buyer placed offer');
    const offerId = offer.json.id;

    const counter = await post(`/exchange/offers/${offerId}/respond`, {
      token: staffToken,
      body: { response: 'counter', amountMinor: 1_400_000 },
    });
    check(
      counter.status === 201 && counter.json?.status === 'countered',
      'staff countered the offer',
    );
    // Counter with no amount is rejected by validation.
    const badCounter = await post(`/exchange/offers/${offerId}/respond`, {
      token: staffToken,
      body: { response: 'counter' },
    });
    check(badCounter.status === 400, `counter without amount -> 400 (got ${badCounter.status})`);
    // D13 — amountMinor is meaningful ONLY for a counter: an accept binds the Sale to the buyer's
    // original amount, so an amountMinor on accept would silently diverge the Offer head from the
    // Sale. It must be rejected, not ignored.
    const acceptWithAmount = await post(`/exchange/offers/${offerId}/respond`, {
      token: staffToken,
      body: { response: 'accept', amountMinor: 9_999_999 },
    });
    check(
      acceptWithAmount.status === 400,
      `accept with amountMinor -> 400 (got ${acceptWithAmount.status})`,
    );

    const accept = await post(`/exchange/offers/${offerId}/respond`, {
      token: staffToken,
      body: { response: 'accept' },
    });
    check(accept.status === 201 && accept.json?.status === 'accepted', 'staff accepted the offer');
    // A buyer cannot respond (staff only).
    const buyerRespond = await post(`/exchange/offers/${offerId}/respond`, {
      token: tokenA,
      body: { response: 'reject' },
    });
    check(buyerRespond.status === 403, `buyer cannot respond -> 403 (got ${buyerRespond.status})`);

    // ---- Sealed Tender: sealed until controlled open, highest wins ----
    const tListing = await makeListing(sellerToken, 'SEALED_TENDER');
    const tA = await post(`/exchange/listings/${tListing}/tender-bids`, {
      token: tokenA,
      body: { amountMinor: 3_000_000 },
    });
    const tB = await post(`/exchange/listings/${tListing}/tender-bids`, {
      token: tokenB,
      body: { amountMinor: 4_200_000 },
    });
    check(
      tA.status === 201 && tA.json?.sealed === true && tA.json?.amountMinor === undefined,
      'tender bid A is a sealed receipt (no amount echoed)',
    );
    check(tB.status === 201, 'tender bid B submitted');
    // Duplicate submission rejected.
    const dupe = await post(`/exchange/listings/${tListing}/tender-bids`, {
      token: tokenA,
      body: { amountMinor: 9_000_000 },
    });
    check(dupe.status === 409, `duplicate tender bid -> 409 (got ${dupe.status})`);
    // Sealed to staff before the open (count only).
    const sealedView = await get(`/exchange/listings/${tListing}/tender-bids`, {
      token: staffToken,
    });
    check(
      sealedView.json?.sealed === true && sealedView.json?.count === 2 && !sealedView.json?.bids,
      'staff sees only a sealed count before open',
    );
    const opened = await post(`/exchange/listings/${tListing}/tender/open`, { token: staffToken });
    check(
      opened.status === 201 && opened.json?.winnerCustomerId === buyerB,
      `tender opened, highest (B) wins (winner=${opened.json?.winnerCustomerId === buyerB})`,
    );
    // Submissions after open are rejected.
    const late = await post(`/exchange/listings/${tListing}/tender-bids`, {
      token: await token(['customer'], await registerCustomer('exC')),
      body: { amountMinor: 5_000_000 },
    });
    check(late.status === 409, `tender bid after open -> 409 (got ${late.status})`);

    // ---- DB assertions: sales, append-only offer history, outbox ----
    const prisma = new PrismaClient();
    try {
      const bnSale = await prisma.sale.findUnique({ where: { listingId: bnListing } });
      check(
        bnSale?.channel === 'buy_now' && Number(bnSale.amountMinor) === 2_500_000,
        'buy-now Sale recorded at price',
      );
      const moSale = await prisma.sale.findUnique({ where: { listingId: moListing } });
      check(
        moSale?.channel === 'make_offer' && Number(moSale.amountMinor) === 1_400_000,
        'make-offer Sale recorded at accepted amount',
      );
      const tSale = await prisma.sale.findUnique({ where: { listingId: tListing } });
      check(
        tSale?.channel === 'sealed_tender' && tSale.buyerCustomerId === buyerB,
        'sealed-tender Sale awarded to highest bidder',
      );

      const history = (
        await prisma.offerEvent.findMany({ where: { offerId }, orderBy: { createdAt: 'asc' } })
      ).map((e) => e.type);
      check(
        history.join(',') === 'offer,counter,accept',
        `offer history is append-only offer→counter→accept (${history.join(',')})`,
      );

      const events = (await prisma.outboxEvent.findMany({ where: { aggregateId: tListing } })).map(
        (e) => e.name,
      );
      check(
        events.includes('TENDER_OPENED') && events.includes('SALE_CONFIRMED'),
        `tender outbox has TENDER_OPENED + SALE_CONFIRMED (${[...new Set(events)].join(', ')})`,
      );
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} exchange E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll exchange E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
