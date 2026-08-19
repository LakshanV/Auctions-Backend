#!/usr/bin/env node
/**
 * Unified Singha identity + Cockpit E2E (unified-identity pass). ONE synthetic Client (X) does
 * everything a Singha member can — buys & wins an auction, lists an item for sale, creates and
 * responds to RFQs, and receives seller proceeds — and the WHOLE history stays attached to the
 * SAME Customer ID and the SAME Singha Client ID (CUS-######). Then the unified Cockpit read-model
 * and the contextual assistant are proven over that one identity, with cross-client privacy.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import PrismaPkg from '@prisma/client';

const { PrismaClient } = PrismaPkg;
const BASE = 'http://localhost:4000';
const API = `${BASE}/api/v1`;
const V2 = `${BASE}/api/v2`;
let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
};
async function req(base, method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
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
const post = (p, o) => req(API, 'POST', p, o);
const get = (p, o) => req(API, 'GET', p, o);
const v2get = (p, o) => req(V2, 'GET', p, o);
const v2post = (p, o) => req(V2, 'POST', p, o);
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
let emailSeq = 0;
const register = async (label) => {
  const slug = label
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
    .replace(/^-|-$/g, '');
  const email = `${slug}-${Date.now()}-${emailSeq++}@sim.local`;
  return (await post('/customers', { body: { legalName: label, email } })).json?.id;
};

async function runAuction({ sellerToken, staffToken, bidderToken, publicRef, openingBidMinor }) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Hiace', year: 2021 } },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: { assetId: asset.json.id, saleMethod: 'TIMED_AUCTION', publicRef },
  });
  const auction = await post('/auctions', {
    token: staffToken,
    body: {
      listingId: listing.json.id,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 60_000).toISOString(),
      openingBidMinor,
      incrementMinor: 10_000,
    },
  });
  await post(`/auctions/${auction.json.id}/open`, { token: staffToken });
  await post(`/auctions/${auction.json.id}/bids`, {
    token: bidderToken,
    body: { maxAmountMinor: openingBidMinor },
  });
  const closed = await post(`/auctions/${auction.json.id}/close`, { token: staffToken });
  return { assetId: asset.json.id, listingId: listing.json.id, auctionId: auction.json.id, closed };
}

async function settle({ listingId, staffToken, accountsToken, buyerToken, amountMinor }) {
  const invoice = await post('/commerce/invoices', { token: staffToken, body: { listingId } });
  const payment = await post(`/commerce/invoices/${invoice.json.id}/payments`, {
    token: buyerToken,
    body: { amountMinor: invoice.json.amountDueMinor, method: 'bank_transfer', proofRef: 'slip' },
  });
  await post(`/commerce/payments/${payment.json.id}/verify`, {
    token: accountsToken,
    body: { decision: 'confirm' },
  });
  await post(`/commerce/listings/${listingId}/release`, { token: staffToken });
  for (const state of ['ready_for_pickup', 'pickup_booked', 'collected', 'completed']) {
    await post(`/commerce/listings/${listingId}/fulfilment`, {
      token: staffToken,
      body: { state },
    });
  }
  const s = await post(`/commerce/listings/${listingId}/settlement`, {
    token: accountsToken,
    body: { reference: `PAYOUT-${Date.now()}` },
  });
  void amountMinor;
  return s;
}

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BUSINESS_BUYER_PREMIUM_PCT: '10',
      BUSINESS_TAX_PCT: '15',
      BUSINESS_SELLER_COMMISSION_PCT: '8',
      // A unified client uses every capability — turn on the procurement two-sided market.
      FEATURE_PROCUREMENT: 'true',
    },
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

    // ── The ONE unified Singha Client (X) + counterparties ──────────────────────
    const X = await register('[SIM] Unified Client');
    // ONE identity, MANY capabilities: the same token principal can bid, buy, sell AND supply.
    const xToken = await token(['seller', 'customer'], X);
    const staffToken = await token(['auction_staff']);
    const accountsToken = await token(['accounts']);
    const Z = await register('[SIM] Counterparty Seller');
    const zToken = await token(['seller'], Z);
    const Y = await register('[SIM] Counterparty Buyer');
    const yToken = await token(['customer', 'seller'], Y);

    // Authoritative Singha Client ID for X — captured ONCE, must never change.
    const xMember = await get('/me/member', { token: xToken });
    const xClientRef = xMember.json?.clientReference;
    check(Boolean(X) && Boolean(xClientRef), `X has one Customer ID + Client ID ${xClientRef}`);

    // ── Phase 1: X BUYS — wins Z's auction ──────────────────────────────────────
    const buy = await runAuction({
      sellerToken: zToken,
      staffToken,
      bidderToken: xToken,
      publicRef: `CKX-BUY-${Date.now()}`,
      openingBidMinor: 1_000_000,
    });
    check(buy.closed.json?.winnerCustomerId === X, 'X wins the auction it bid in (X is the buyer)');
    // Issue the invoice → creates the Sale(buyer=X); X now has a purchase + an amount to pay.
    const buyInvoice = await post('/commerce/invoices', {
      token: staffToken,
      body: { listingId: buy.listingId },
    });
    check(
      buyInvoice.status === 201 && buyInvoice.json?.amountDueMinor > 0,
      'X owes on its purchase',
    );

    // ── Phase 2: X LISTS an item for sale (same identity, seller context) ───────
    const sellAsset = await post('/assets', {
      token: xToken,
      body: { category: 'machinery', attributes: { make: 'Kubota', model: 'L4508', year: 2022 } },
    });
    const sellListing = await post('/listings', {
      token: xToken,
      body: {
        assetId: sellAsset.json.id,
        saleMethod: 'TIMED_AUCTION',
        publicRef: `CKX-SELL-${Date.now()}`,
      },
    });
    check(
      sellListing.status === 201 && sellListing.json?.id,
      'X lists its own item for sale (no second account)',
    );

    // ── Phase 3: X responds to an RFQ, and posts its own RFQ ────────────────────
    const zRfq = await post('/procurement/requests', {
      token: zToken,
      body: { type: 'RFQ', title: '[SIM] Need 10t steel', currency: 'LKR' },
    });
    const xProposal = await post(`/procurement/requests/${zRfq.json.id}/proposals`, {
      token: xToken,
      body: { proposal: { currency: 'LKR', totalPriceMinor: 750_000 }, notes: 'Can supply' },
    });
    check(xProposal.status === 201, `X responds to an RFQ as supplier (${xProposal.status})`);
    const xRfq = await post('/procurement/requests', {
      token: xToken,
      body: { type: 'RFQ', title: '[SIM] X needs packaging', currency: 'LKR' },
    });
    check(xRfq.status === 201, 'X posts its own RFQ (procurement buyer context)');

    // ── Phase 4: X's listed item SELLS to Y → X receives seller proceeds ────────
    // Y wins X's item; run a fresh auction on X's listing.
    const sellAuction = await post('/auctions', {
      token: staffToken,
      body: {
        listingId: sellListing.json.id,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        openingBidMinor: 2_000_000,
        incrementMinor: 10_000,
      },
    });
    await post(`/auctions/${sellAuction.json.id}/open`, { token: staffToken });
    await post(`/auctions/${sellAuction.json.id}/bids`, {
      token: yToken,
      body: { maxAmountMinor: 2_000_000 },
    });
    const sellClosed = await post(`/auctions/${sellAuction.json.id}/close`, { token: staffToken });
    check(sellClosed.json?.winnerCustomerId === Y, "Y wins X's listed item");
    const settlement = await settle({
      listingId: sellListing.json.id,
      staffToken,
      accountsToken,
      buyerToken: yToken,
      amountMinor: 2_000_000,
    });
    check(
      settlement.status === 201 && settlement.json?.netMinor > 0,
      `X's sale settles with seller proceeds (net ${settlement.json?.netMinor})`,
    );

    // ── The unified Cockpit over the ONE identity ───────────────────────────────
    const cockpit = await v2get('/me/cockpit', { token: xToken });
    const c = cockpit.json;
    check(cockpit.status === 200 && c?.identity, `X cockpit loads (${cockpit.status})`);
    check(
      c?.identity?.customerId === X && c?.identity?.clientReference === xClientRef,
      'cockpit identity is the SAME Customer ID + Client ID throughout',
    );
    check(
      c?.identity?.roles?.includes('buyer') && c?.identity?.roles?.includes('seller'),
      `one identity is BOTH buyer and seller (roles: ${c?.identity?.roles?.join('+')})`,
    );
    check(
      c?.identity?.emphasis === 'both',
      `adaptive emphasis = both (got ${c?.identity?.emphasis})`,
    );
    check(
      Array.isArray(c?.buying?.won) && c.buying.won.some((l) => l.listingId === buy.listingId),
      'cockpit BUYING shows the auction X won',
    );
    check(
      Array.isArray(c?.buying?.purchases) && c.buying.purchases.length >= 1,
      'cockpit BUYING shows X’s purchase',
    );
    check(
      Array.isArray(c?.selling?.sales) &&
        c.selling.sales.some((s) => s.listingId === sellListing.json.id),
      'cockpit SELLING shows X’s sale (same identity sells)',
    );
    check(
      Array.isArray(c?.selling?.settlements) && c.selling.settlements.length >= 1,
      'cockpit SELLING shows X’s seller proceeds/settlement',
    );
    check(
      Array.isArray(c?.procurement?.requests) &&
        c.procurement.requests.some((r) => r.requestId === xRfq.json.id),
      'cockpit PROCUREMENT shows X’s RFQ',
    );

    // ── Singha Account Health — deterministic facts, no opaque score ────────────
    const health = await v2get('/me/cockpit/account-health', { token: xToken });
    const h = health.json;
    check(
      health.status === 200 && (h?.status === 'clear' || h?.status === 'attention'),
      `account health is a deterministic status (${h?.status})`,
    );
    check(typeof h?.bidCapacity?.availableMinor === 'number', 'health reports bid capacity facts');
    check(
      h?.amountsToPay?.totalMinor > 0,
      'health reports amounts to pay (X owes on its purchase)',
    );
    check(
      h?.sellerProceeds?.settledMinor > 0,
      `health reports settled seller proceeds (${h?.sellerProceeds?.settledMinor})`,
    );
    check(
      !('score' in (h ?? {})) && !('creditScore' in (h ?? {})),
      'account health carries NO opaque consumer credit score',
    );

    // ── Contextual Singha AI — interprets intent, answers from authoritative facts ─
    const ask = async (question) =>
      (await v2post('/me/cockpit/ask', { token: xToken, body: { question } })).json;
    const aCap = await ask('How much can I bid?');
    check(aCap?.intent === 'bid_capacity' && aCap?.facts?.bidCapacity, 'AI: “how much can I bid?”');
    const aOwe = await ask('What money do I owe?');
    check(
      aOwe?.intent === 'amounts_owed' && aOwe?.facts?.amountsToPay?.totalMinor > 0,
      'AI: “what do I owe?” → authoritative owed amount',
    );
    const aProceeds = await ask('What seller proceeds are pending?');
    check(aProceeds?.intent === 'seller_proceeds', 'AI: “what seller proceeds?”');
    const aWin = await ask('What am I winning?');
    check(aWin?.intent === 'winning', 'AI: “what am I winning?”');
    const aBuy = await ask('Where are my purchases?');
    check(
      aBuy?.intent === 'purchases' && Array.isArray(aBuy?.facts?.purchases),
      'AI: “where are my purchases?”',
    );
    const aAtt = await ask('What needs my attention?');
    check(aAtt?.intent === 'attention', 'AI: “what needs my attention?”');

    // ── Privacy + auth ──────────────────────────────────────────────────────────
    const yCockpit = await v2get('/me/cockpit', { token: yToken });
    check(
      yCockpit.status === 200 && yCockpit.json?.identity?.customerId === Y,
      'a different client sees THEIR own cockpit',
    );
    check(
      !(yCockpit.json?.buying?.purchases ?? []).some((p) => p.listingId === buy.listingId),
      'X’s purchases never leak into Y’s cockpit',
    );
    const anon = await v2get('/me/cockpit');
    check(
      anon.status === 401 || anon.status === 403,
      `unauthenticated cockpit -> 401/403 (${anon.status})`,
    );

    // ── DB: the entire history is on the SAME Customer ID ───────────────────────
    const boughtBid = await prisma.bid.findFirst({
      where: { auctionId: buy.auctionId, bidderId: X },
    });
    check(Boolean(boughtBid), 'DB: X’s winning bid references X.id (buyer context)');
    const soldAsset = await prisma.asset.findUnique({ where: { id: sellAsset.json.id } });
    check(
      soldAsset?.ownerCustomerId === X,
      'DB: X’s listed asset is owned by X.id (seller context)',
    );
    const xPurchase = await prisma.sale.findFirst({ where: { buyerCustomerId: X } });
    check(Boolean(xPurchase), 'DB: X’s purchase Sale references X.id as buyer');
    const xSellerSettlement = await prisma.settlement.findFirst({
      where: { listing: { asset: { ownerCustomerId: X } } },
    });
    check(
      Boolean(xSellerSettlement),
      'DB: X’s seller settlement traces to X.id via asset ownership',
    );
    const customerRows = await prisma.customer.count({ where: { id: X } });
    const refRows = await prisma.customer.count({ where: { clientReference: xClientRef } });
    check(
      customerRows === 1 && refRows === 1,
      'DB: exactly ONE Customer row + ONE Client ID for X (no second account)',
    );

    await prisma.$disconnect();
    if (failures > 0) {
      console.error(`\n${failures} cockpit E2E check(s) failed.`);
      process.exit(1);
    }
    console.log('\nAll unified-identity + Cockpit E2E checks passed.');
  } finally {
    child.kill('SIGKILL');
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
