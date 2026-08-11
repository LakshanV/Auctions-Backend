#!/usr/bin/env node
/**
 * Phase 6 Commerce E2E (docs/14 gate: full transaction). Wins a timed auction,
 * then drives the whole post-sale pipeline: invoice (with premium + VAT) →
 * manual payment (proof ≠ paid) → accounts verifies → release (needs confirmed
 * payment) → fulfilment to completed → seller settlement → Evidence Pack. Also
 * proves the financial ledger is APPEND-ONLY and release can't precede payment.
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
    // Non-zero fees so premium/tax/settlement are exercised.
    env: {
      ...process.env,
      BUSINESS_BUYER_PREMIUM_PCT: '10',
      BUSINESS_TAX_PCT: '15',
      BUSINESS_SELLER_COMMISSION_PCT: '8',
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
    const buyer = await registerCustomer('buyer');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff']);
    const accountsToken = await token(['accounts']);
    const buyerToken = await token(['customer'], buyer);

    // Win a timed auction at 1,000,000.
    const asset = await post('/assets', {
      token: sellerToken,
      body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Aqua', year: 2019 } },
    });
    const listing = await post('/listings', {
      token: sellerToken,
      body: { assetId: asset.json.id, saleMethod: 'TIMED_AUCTION', publicRef: `COM-${Date.now()}` },
    });
    const listingId = listing.json.id;
    const auction = await post('/auctions', {
      token: staffToken,
      body: {
        listingId,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        openingBidMinor: 1_000_000,
        incrementMinor: 10_000,
        reserveMinor: 500_000,
      },
    });
    const auctionId = auction.json.id;
    await post(`/auctions/${auctionId}/open`, { token: staffToken });
    await post(`/auctions/${auctionId}/bids`, {
      token: buyerToken,
      body: { maxAmountMinor: 1_000_000 },
    });
    const closed = await post(`/auctions/${auctionId}/close`, { token: staffToken });
    check(closed.json?.winnerCustomerId === buyer, 'buyer won the auction');

    // Issue the invoice (premium 10% = 100k, VAT 15% on premium = 15k → due 1,115,000).
    const invoice = await post('/commerce/invoices', { token: staffToken, body: { listingId } });
    check(
      invoice.status === 201 && invoice.json?.amountDueMinor === 1_115_000,
      `invoice due = 1,115,000 (got ${invoice.json?.amountDueMinor})`,
    );
    const invoiceId = invoice.json.id;

    // Release before payment must fail.
    const earlyRelease = await post(`/commerce/listings/${listingId}/release`, {
      token: staffToken,
    });
    check(
      earlyRelease.status === 409,
      `release before payment -> 409 (got ${earlyRelease.status})`,
    );

    // Buyer submits proof of payment — NOT equivalent to being paid.
    const payment = await post(`/commerce/invoices/${invoiceId}/payments`, {
      token: buyerToken,
      body: { amountMinor: 1_115_000, method: 'bank_transfer', proofRef: 'slip-123' },
    });
    check(
      payment.status === 201 && payment.json?.status === 'pending_verification',
      'payment recorded as pending_verification',
    );
    const stillUnpaid = await get(`/commerce/invoices/${invoiceId}`, { token: staffToken });
    check(stillUnpaid.json?.status === 'issued', 'invoice still issued before verification');

    // Accounts verifies → invoice paid + fulfilment payment_confirmed.
    const verify = await post(`/commerce/payments/${payment.json.id}/verify`, {
      token: accountsToken,
      body: { decision: 'confirm' },
    });
    check(
      verify.status === 201 && verify.json?.status === 'confirmed',
      'accounts confirmed payment',
    );
    const paid = await get(`/commerce/invoices/${invoiceId}`, { token: staffToken });
    check(paid.json?.status === 'paid', 'invoice marked paid after verification');

    // Release now works; then fulfilment to completed.
    const release = await post(`/commerce/listings/${listingId}/release`, { token: staffToken });
    check(
      release.status === 201 &&
        release.json?.state === 'release_approved' &&
        release.json?.releaseRef,
      'release approved with a reference',
    );
    for (const [state, ok] of [
      ['ready_for_pickup', true],
      ['pickup_booked', true],
      ['collected', true],
      ['completed', true],
    ]) {
      const r = await post(`/commerce/listings/${listingId}/fulfilment`, {
        token: staffToken,
        body: { state },
      });
      check(r.status === 201 && r.json?.state === state, `fulfilment -> ${state}`);
    }

    // Seller settlement: commission 8% = 80k, VAT on commission 15% = 12k → net 908,000.
    const settle = await post(`/commerce/listings/${listingId}/settlement`, {
      token: accountsToken,
      body: { reference: 'PAYOUT-1' },
    });
    check(
      settle.status === 201 && settle.json?.netMinor === 908_000,
      `seller net settlement = 908,000 (got ${settle.json?.netMinor})`,
    );

    // Evidence Pack bundles the whole transaction.
    const pack = await get(`/commerce/listings/${listingId}/evidence-pack`, { token: staffToken });
    check(
      pack.status === 200 &&
        pack.json?.invoice?.status === 'paid' &&
        pack.json?.settlement?.netMinor === 908_000 &&
        pack.json?.bidTimeline?.length >= 1 &&
        pack.json?.release?.releaseRef,
      'evidence pack bundles invoice + settlement + bid timeline + release',
    );

    // Append-only ledger via the DB.
    const prisma = new PrismaClient();
    try {
      const ledger = await prisma.ledgerEntry.findMany({
        where: { listingId },
        orderBy: { createdAt: 'asc' },
      });
      const types = ledger.map((l) => l.entryType);
      check(
        ['sale_charge', 'buyer_premium', 'tax', 'payment_received', 'settlement_disbursed'].every(
          (t) => types.includes(t),
        ),
        `ledger has all event types (${[...new Set(types)].join(', ')})`,
      );
      let blocked = false;
      try {
        await prisma.ledgerEntry.update({ where: { id: ledger[0].id }, data: { amountMinor: 1n } });
      } catch {
        blocked = true;
      }
      check(blocked, 'financial ledger UPDATE rejected (append-only)');
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} commerce E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll commerce E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
