#!/usr/bin/env node
/**
 * Cockpit correction-pass regression E2E. Proves the three properties the correction pass added to
 * the one unified Singha Cockpit:
 *
 *   P1  Multi-currency Account Health — monetary minor units are NEVER summed across currencies.
 *       Amounts to pay, seller proceeds and settlements are grouped by the AUTHORITATIVE transaction
 *       currency, each carrying its canonical ISO-4217 minor-unit exponent and a precision-safe
 *       string amount (never Number(BigInt)). Optional display-currency equivalents stay purely
 *       informational (binding:false) and never replace the per-currency authoritative amounts.
 *
 *   P1/P2  Organisation context — one human keeps ONE Customer/Client ID but may act for ≥1
 *       Organisation through authorised membership. Personal and per-org financial/activity state
 *       are never mixed; an unauthorised org context is refused.
 *
 *   P2  Unified Activity Timeline — a single chronological projection over authoritative events
 *       (bids, purchases, sales, settlements, …), newest-first, never a second ledger.
 *
 * All money flows through the real API write path; a listing's display currency (no create-time API
 * field) is set with a single authoritative column update so settled proceeds exercise >1 currency.
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

let refSeq = 0;
const uniqueRef = (p) => `${p}-${Date.now()}-${refSeq++}`;

/** One full timed auction in a chosen currency: seller consigns, staff runs it, one bidder wins. */
async function runAuction({ sellerToken, staffToken, bidderToken, currency, openingBidMinor }) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Hiace', year: 2021 } },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: { assetId: asset.json.id, saleMethod: 'TIMED_AUCTION', publicRef: uniqueRef('ctx') },
  });
  const auction = await post('/auctions', {
    token: staffToken,
    body: {
      listingId: listing.json.id,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 60_000).toISOString(),
      currency,
      openingBidMinor,
      incrementMinor: 10_000,
    },
  });
  await post(`/auctions/${auction.json.id}/open`, { token: staffToken });
  await post(`/auctions/${auction.json.id}/bids`, {
    token: bidderToken,
    body: { maxAmountMinor: openingBidMinor },
  });
  await post(`/auctions/${auction.json.id}/close`, { token: staffToken });
  return { assetId: asset.json.id, listingId: listing.json.id, auctionId: auction.json.id };
}

/** Issue the buyer invoice for a won lot and leave it UNPAID (so it counts as an amount to pay). */
async function issueInvoice({ listingId, staffToken }) {
  return (await post('/commerce/invoices', { token: staffToken, body: { listingId } })).json;
}

/** Fully settle a lot end-to-end so the seller has a Settlement (settled proceeds). */
async function settle({ listingId, staffToken, accountsToken, buyerToken }) {
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
  return (
    await post(`/commerce/listings/${listingId}/settlement`, {
      token: accountsToken,
      body: { reference: uniqueRef('PAYOUT') },
    })
  ).json;
}

const rowFor = (byCurrency, cur) => (byCurrency ?? []).find((b) => b.currency === cur);
const hasNoScalarMoney = (obj, forbidden) => forbidden.every((k) => !(k in (obj ?? {})));

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BUSINESS_BUYER_PREMIUM_PCT: '10',
      BUSINESS_TAX_PCT: '15',
      BUSINESS_SELLER_COMMISSION_PCT: '8',
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

    const staffToken = await token(['auction_staff']);
    const accountsToken = await token(['accounts']);
    // A shared counterparty buyer for the seller-side lots (its own cockpit is irrelevant here).
    const buyer = await register('[SIM] Ctx Buyer');
    const buyerToken = await token(['customer', 'seller'], buyer);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE A — MULTI-CURRENCY ACCOUNT HEALTH (P1)
    // One personal client transacts simultaneously in LKR + AUD + USD.
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n── Phase A: multi-currency Account Health (LKR + AUD + USD) ──');
    const X = await register('[SIM] MultiCurrency Client');
    const xToken = await token(['seller', 'customer'], X);
    const seller = await register('[SIM] Ctx Seller'); // sells the lots X buys
    const sellerToken = await token(['seller'], seller);

    // X BUYS & wins one lot per currency → three issued (unpaid) invoices in three currencies.
    const buyAmounts = { LKR: 1_000_000, AUD: 2_000_000, USD: 3_000_000 };
    const buyInvoices = {};
    for (const cur of ['LKR', 'AUD', 'USD']) {
      const lot = await runAuction({
        sellerToken,
        staffToken,
        bidderToken: xToken,
        currency: cur,
        openingBidMinor: buyAmounts[cur],
      });
      buyInvoices[cur] = await issueInvoice({ listingId: lot.listingId, staffToken });
    }
    check(
      ['LKR', 'AUD', 'USD'].every((c) => buyInvoices[c]?.currency === c),
      'three buyer invoices issued in three distinct currencies (LKR/AUD/USD)',
    );

    // X SELLS: an AUD lot fully settled, a USD lot left pending → multi-currency seller proceeds.
    const sellAud = await runAuction({
      sellerToken: xToken,
      staffToken,
      bidderToken: buyerToken,
      currency: 'AUD',
      openingBidMinor: 5_000_000,
    });
    await prisma.listing.update({ where: { id: sellAud.listingId }, data: { currency: 'AUD' } });
    const settlementAud = await settle({
      listingId: sellAud.listingId,
      staffToken,
      accountsToken,
      buyerToken,
    });
    const sellUsd = await runAuction({
      sellerToken: xToken,
      staffToken,
      bidderToken: buyerToken,
      currency: 'USD',
      openingBidMinor: 4_000_000,
    });
    await prisma.listing.update({ where: { id: sellUsd.listingId }, data: { currency: 'USD' } });

    // ── Account Health: per-currency grouping, precision-safe, no cross-sum ──
    const health = (await v2get('/me/cockpit/account-health', { token: xToken })).json;
    const pay = health?.amountsToPay;
    const proceeds = health?.sellerProceeds;

    check(
      Array.isArray(pay?.byCurrency) && pay.byCurrency.length === 3,
      `amounts to pay grouped into exactly 3 currencies (got ${pay?.byCurrency?.length})`,
    );
    for (const cur of ['LKR', 'AUD', 'USD']) {
      const row = rowFor(pay?.byCurrency, cur);
      check(
        row &&
          typeof row.total === 'string' &&
          BigInt(row.total) === BigInt(buyInvoices[cur].amountDueMinor),
        `amounts to pay: ${cur} total is a precision-safe string equal to the ${cur} invoice (${row?.total})`,
      );
      check(row?.exponent === 2, `amounts to pay: ${cur} carries its ISO-4217 minor exponent (2)`);
    }
    check(
      hasNoScalarMoney(pay, ['total', 'totalMinor', 'amountMinor', 'amountDueMinor']),
      'amounts to pay exposes NO scalar cross-currency total (grouping only)',
    );
    check(
      hasNoScalarMoney(proceeds, ['pendingMinor', 'settledMinor', 'totalMinor']),
      'seller proceeds exposes NO scalar cross-currency total (grouping only)',
    );

    // Seller proceeds: AUD settled (from settlement.netMinor), USD pending (from the unsettled sale).
    const audProceeds = rowFor(proceeds?.byCurrency, 'AUD');
    const usdProceeds = rowFor(proceeds?.byCurrency, 'USD');
    check(
      audProceeds &&
        BigInt(audProceeds.settled) === BigInt(settlementAud.netMinor) &&
        BigInt(audProceeds.settled) > 0n,
      `seller proceeds: AUD settled equals the AUD settlement net (${audProceeds?.settled})`,
    );
    check(
      usdProceeds && BigInt(usdProceeds.pending) > 0n && BigInt(usdProceeds.settled ?? '0') === 0n,
      `seller proceeds: USD is pending (unsettled), not blended into AUD (${usdProceeds?.pending})`,
    );

    // Independent DB truth: grouped invoice sums per currency match the cockpit exactly.
    const dbPay = await prisma.invoice.groupBy({
      by: ['currency'],
      where: { buyerCustomerId: X, status: 'issued' },
      _sum: { amountDueMinor: true },
    });
    check(
      dbPay.length === 3 &&
        dbPay.every(
          (g) => BigInt(rowFor(pay.byCurrency, g.currency).total) === BigInt(g._sum.amountDueMinor),
        ),
      'DB agreement: grouped invoice sums per currency match the cockpit per-currency totals',
    );

    // ── Contextual AI names every currency and never blends them ──
    const owe = (
      await v2post('/me/cockpit/ask', { token: xToken, body: { question: 'What money do I owe?' } })
    ).json;
    check(
      owe?.intent === 'amounts_owed' &&
        ['LKR', 'AUD', 'USD'].every((c) => (owe.reply ?? '').includes(c)),
      'AI "what do I owe?" names all three currencies (no single blended figure)',
    );
    check(
      Array.isArray(owe?.facts?.amountsToPay?.byCurrency) &&
        owe.facts.amountsToPay.byCurrency.length === 3,
      'AI owed-amount facts stay grouped per currency',
    );

    // ── Optional display equivalents are informational only; authoritative amounts untouched ──
    const withDisplay = (await v2get('/me/cockpit/account-health?display=USD', { token: xToken }))
      .json;
    check(
      Array.isArray(withDisplay?.amountsToPay?.byCurrency) &&
        withDisplay.amountsToPay.byCurrency.length === 3,
      'display request leaves the authoritative per-currency amounts intact',
    );
    if (withDisplay?.display) {
      check(
        withDisplay.display.binding === false && typeof withDisplay.display.note === 'string',
        'display equivalents are explicitly non-binding (informational only)',
      );
    } else {
      console.log(
        '  • display equivalents omitted (no FX snapshot) — authoritative amounts still exact',
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE B — ORGANISATION CONTEXT (P1/P2): one human, two orgs, plus personal.
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n── Phase B: organisation context (one human, two orgs, never mixed) ──');
    const H = await register('[SIM] Two-Org Human');
    const hToken = await token(['seller', 'customer'], H);
    const hClient = (await get('/me/member', { token: hToken })).json?.clientReference;

    // Org A — a sole-member consignor creates it and consigns one AUD lot (settled), THEN adds H.
    const consignorA = await register('[SIM] Consignor A');
    const caToken = await token(['seller'], consignorA);
    const orgA = (
      await post('/organizations', {
        token: caToken,
        body: { legalName: '[SIM] Org Alpha', publicRef: uniqueRef('org-alpha') },
      })
    ).json;
    const lotA = await runAuction({
      sellerToken: caToken,
      staffToken,
      bidderToken: buyerToken,
      currency: 'AUD',
      openingBidMinor: 6_000_000,
    });
    await prisma.listing.update({ where: { id: lotA.listingId }, data: { currency: 'AUD' } });
    await settle({ listingId: lotA.listingId, staffToken, accountsToken, buyerToken });
    await post(`/organizations/${orgA.id}/members`, {
      token: caToken,
      body: { customerId: H, role: 'staff' },
    });

    // Org B — a different consignor, one USD lot (left pending), THEN adds H.
    const consignorB = await register('[SIM] Consignor B');
    const cbToken = await token(['seller'], consignorB);
    const orgB = (
      await post('/organizations', {
        token: cbToken,
        body: { legalName: '[SIM] Org Bravo', publicRef: uniqueRef('org-bravo') },
      })
    ).json;
    const lotB = await runAuction({
      sellerToken: cbToken,
      staffToken,
      bidderToken: buyerToken,
      currency: 'USD',
      openingBidMinor: 7_000_000,
    });
    await prisma.listing.update({ where: { id: lotB.listingId }, data: { currency: 'USD' } });
    await post(`/organizations/${orgB.id}/members`, {
      token: cbToken,
      body: { customerId: H, role: 'staff' },
    });

    // Org C — H is deliberately NOT a member (authorisation boundary).
    const consignorC = await register('[SIM] Consignor C');
    const ccToken = await token(['seller'], consignorC);
    const orgC = (
      await post('/organizations', {
        token: ccToken,
        body: { legalName: '[SIM] Org Charlie', publicRef: uniqueRef('org-charlie') },
      })
    ).json;

    // H's PERSONAL selling — H already belongs to two orgs, so the asset is ambiguous → personal.
    const lotPersonal = await runAuction({
      sellerToken: hToken,
      staffToken,
      bidderToken: buyerToken,
      currency: 'LKR',
      openingBidMinor: 800_000,
    });
    const personalAsset = await prisma.asset.findUnique({ where: { id: lotPersonal.assetId } });
    check(
      personalAsset?.ownerCustomerId === H && personalAsset?.sellerOrganizationId === null,
      "H's own consignment stays PERSONAL (multi-org membership is never auto-attributed)",
    );

    const sellingListingIds = (c) => (c?.selling?.sales ?? []).map((s) => s.listingId);

    // Personal context: sees H's own lot + both memberships; never the orgs' lots.
    const cPersonal = (await v2get('/me/cockpit', { token: hToken })).json;
    check(cPersonal?.context?.kind === 'personal', 'personal cockpit reports personal context');
    check(
      cPersonal?.identity?.clientReference === hClient,
      'the one human keeps ONE Client ID across every context',
    );
    check(
      (cPersonal?.organizations ?? [])
        .map((o) => o.organizationId)
        .sort()
        .join(',') === [orgA.id, orgB.id].sort().join(','),
      'personal cockpit lists BOTH authorised organisations (context selector)',
    );
    check(
      sellingListingIds(cPersonal).includes(lotPersonal.listingId),
      'personal cockpit shows the human’s own personal sale',
    );
    check(
      !sellingListingIds(cPersonal).includes(lotA.listingId) &&
        !sellingListingIds(cPersonal).includes(lotB.listingId),
      'personal cockpit NEVER shows org-owned sales (no mixing into personal)',
    );

    // Org A context: only Org A's lot; personal + Org B excluded; personal financials excluded.
    const cA = (await v2get(`/me/cockpit?org=${orgA.id}`, { token: hToken })).json;
    check(
      cA?.context?.kind === 'organization' && cA?.context?.organizationId === orgA.id,
      'org-A cockpit reports the Org A organisation context',
    );
    check(
      sellingListingIds(cA).includes(lotA.listingId) &&
        !sellingListingIds(cA).includes(lotB.listingId) &&
        !sellingListingIds(cA).includes(lotPersonal.listingId),
      'org-A cockpit shows ONLY Org A sales (personal + Org B excluded)',
    );
    check(
      (cA?.accountHealth?.amountsToPay?.byCurrency ?? []).length === 0,
      'org-A Account Health carries NO personal invoices (personal money never mixed into org)',
    );
    check(
      (cA?.accountHealth?.sellerProceeds?.byCurrency ?? []).some((b) => b.currency === 'AUD'),
      'org-A Account Health reports Org A’s own (AUD) seller proceeds',
    );

    // Org B context: only Org B's lot.
    const cB = (await v2get(`/me/cockpit?org=${orgB.id}`, { token: hToken })).json;
    check(
      cB?.context?.organizationId === orgB.id &&
        sellingListingIds(cB).includes(lotB.listingId) &&
        !sellingListingIds(cB).includes(lotA.listingId) &&
        !sellingListingIds(cB).includes(lotPersonal.listingId),
      'org-B cockpit shows ONLY Org B sales',
    );

    // Unauthorised org context is refused.
    const cForbidden = await v2get(`/me/cockpit?org=${orgC.id}`, { token: hToken });
    check(
      cForbidden.status === 403,
      `an unauthorised organisation context is refused (got ${cForbidden.status})`,
    );

    // DB truth: attribution + membership are exactly as the cockpit projects them.
    const saleA = await prisma.sale.findFirst({ where: { listingId: lotA.listingId } });
    check(saleA?.sellerOrganizationId === orgA.id, 'DB: Org A sale is durably attributed to Org A');
    const hMemberships = await prisma.organizationMember.findMany({ where: { customerId: H } });
    check(
      hMemberships.length === 2 &&
        [orgA.id, orgB.id].every((id) => hMemberships.some((m) => m.organizationId === id)),
      'DB: the one human holds exactly two org memberships (A + B), one Customer ID',
    );

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE C — UNIFIED ACTIVITY TIMELINE (P2): projection, newest-first, per-context.
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n── Phase C: unified Activity Timeline (projection, not a 2nd ledger) ──');
    const tl = (await v2get('/me/cockpit/timeline', { token: xToken })).json; // X = rich personal history
    check(
      tl?.context === 'personal' && Array.isArray(tl?.entries),
      'personal timeline returns entries',
    );
    check(
      (tl?.entries?.length ?? 0) > 0,
      `personal timeline has activity (${tl?.entries?.length} entries)`,
    );
    const sortedDesc = (tl?.entries ?? []).every((e, i, a) => i === 0 || a[i - 1].at >= e.at);
    check(sortedDesc, 'timeline is chronological, newest-first');
    check(
      (tl?.entries ?? []).every((e) => e.at && e.kind && e.group && e.refType && e.refId),
      'every entry is a projection back to an authoritative record (refType + refId)',
    );
    const groups = new Set((tl?.entries ?? []).map((e) => e.group));
    check(
      groups.has('bidding') && groups.has('buying') && groups.has('selling'),
      `timeline spans buying, selling AND bidding activity (${[...groups].join(', ')})`,
    );

    // Org timeline is scoped to that org and excludes personal activity.
    const tlA = (await v2get(`/me/cockpit/timeline?org=${orgA.id}`, { token: hToken })).json;
    const tlAListings = (tlA?.entries ?? []).map((e) => e.listing?.listingId).filter(Boolean);
    check(tlA?.context === 'organization', 'org-A timeline reports organisation context');
    check(
      tlAListings.includes(lotA.listingId) && !tlAListings.includes(lotPersonal.listingId),
      'org-A timeline shows Org A events and never the human’s personal sale',
    );

    console.log('');
    if (failures === 0) {
      console.log(
        'All Cockpit correction-pass (multi-currency + org-context + timeline) checks passed.',
      );
    } else {
      console.error(`${failures} Cockpit correction-pass check(s) failed.`);
    }
  } catch (err) {
    console.error('E2E crashed:', err);
    failures += 1;
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
