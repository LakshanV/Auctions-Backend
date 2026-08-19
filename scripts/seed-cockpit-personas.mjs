#!/usr/bin/env node
/**
 * Seed 4 Cockpit personas against an already-running local Singha API (:4000, DEMO_AUTH) and write
 * their dev-JWT bearers + context to a JSON file the Playwright cockpit spec consumes. Personas:
 *   A buysAndSells   — one client that both wins an auction and sells a lot (settled)
 *   B multiCurrency  — one client owing LKR + AUD + USD and holding AUD/USD seller proceeds
 *   C orgMember      — one human, member of an organisation that owns an (AUD, settled) sale
 *   D unauthorized   — a separate client that is NOT a member of C's organisation
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2] || '/tmp/cockpit-personas.json';
const API = 'http://localhost:4000/api/v1';
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
const token = async (roles, customerId) =>
  (await post('/dev/token', { body: { roles, customerId } })).json?.token;
let seq = 0;
const uniq = (p) => `${p}-${Date.now()}-${seq++}`;
const register = async (label) => {
  const email = `${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${Date.now()}-${seq++}@sim.local`;
  return (await post('/customers', { body: { legalName: label, email } })).json?.id;
};
async function runAuction({ sellerToken, staffToken, bidderToken, currency, opening }) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Hiace', year: 2021 } },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: { assetId: asset.json.id, saleMethod: 'TIMED_AUCTION', publicRef: uniq('cp') },
  });
  const auction = await post('/auctions', {
    token: staffToken,
    body: {
      listingId: listing.json.id,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 60_000).toISOString(),
      currency,
      openingBidMinor: opening,
      incrementMinor: 10_000,
    },
  });
  await post(`/auctions/${auction.json.id}/open`, { token: staffToken });
  await post(`/auctions/${auction.json.id}/bids`, {
    token: bidderToken,
    body: { maxAmountMinor: opening },
  });
  await post(`/auctions/${auction.json.id}/close`, { token: staffToken });
  return { assetId: asset.json.id, listingId: listing.json.id };
}
const issueInvoice = (listingId, staffToken) =>
  post('/commerce/invoices', { token: staffToken, body: { listingId } });
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
  for (const state of ['ready_for_pickup', 'pickup_booked', 'collected', 'completed'])
    await post(`/commerce/listings/${listingId}/fulfilment`, {
      token: staffToken,
      body: { state },
    });
  await post(`/commerce/listings/${listingId}/settlement`, {
    token: accountsToken,
    body: { reference: uniq('PO') },
  });
}

async function main() {
  // wait for API
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://localhost:4000/healthz')).ok) break;
    } catch {
      /* no body */
    }
    await sleep(500);
  }
  const staff = await token(['auction_staff']);
  const accounts = await token(['accounts']);
  const counterSeller = await register('[SIM] CP Seller');
  const counterSellerT = await token(['seller'], counterSeller);
  const counterBuyer = await register('[SIM] CP Buyer');
  const counterBuyerT = await token(['customer', 'seller'], counterBuyer);

  const clientRef = async (t) =>
    await get('/me/member', { token: t }).then((r) => r.json?.clientReference);

  // ── A: buys AND sells ──
  const A = await register('[SIM] Persona A BuyerSeller');
  const At = await token(['seller', 'customer'], A);
  const aBuy = await runAuction({
    sellerToken: counterSellerT,
    staffToken: staff,
    bidderToken: At,
    currency: 'LKR',
    opening: 1_500_000,
  });
  await issueInvoice(aBuy.listingId, staff);
  const aSell = await runAuction({
    sellerToken: At,
    staffToken: staff,
    bidderToken: counterBuyerT,
    currency: 'LKR',
    opening: 2_000_000,
  });
  await settle({
    listingId: aSell.listingId,
    staffToken: staff,
    accountsToken: accounts,
    buyerToken: counterBuyerT,
  });

  // ── B: multi-currency ──
  const B = await register('[SIM] Persona B MultiCurrency');
  const Bt = await token(['seller', 'customer'], B);
  for (const [cur, amt] of [
    ['LKR', 1_000_000],
    ['AUD', 2_000_000],
    ['USD', 3_000_000],
  ]) {
    const lot = await runAuction({
      sellerToken: counterSellerT,
      staffToken: staff,
      bidderToken: Bt,
      currency: cur,
      opening: amt,
    });
    await issueInvoice(lot.listingId, staff);
  }

  // ── C: corporate org member ──
  const C = await register('[SIM] Persona C OrgMember');
  const Ct = await token(['seller', 'customer'], C);
  const consignor = await register('[SIM] CP Consignor');
  const consignorT = await token(['seller'], consignor);
  const org = (
    await post('/organizations', {
      token: consignorT,
      body: { legalName: '[SIM] Northgate Traders', publicRef: uniq('org-northgate') },
    })
  ).json;
  const orgLot = await runAuction({
    sellerToken: consignorT,
    staffToken: staff,
    bidderToken: counterBuyerT,
    currency: 'AUD',
    opening: 6_000_000,
  });
  await settle({
    listingId: orgLot.listingId,
    staffToken: staff,
    accountsToken: accounts,
    buyerToken: counterBuyerT,
  });
  await post(`/organizations/${org.id}/members`, {
    token: consignorT,
    body: { customerId: C, role: 'staff' },
  });
  // C also has a personal sale so Personal vs Org contexts visibly differ.
  const cPersonal = await runAuction({
    sellerToken: Ct,
    staffToken: staff,
    bidderToken: counterBuyerT,
    currency: 'LKR',
    opening: 900_000,
  });
  void cPersonal;

  // ── D: unauthorized 2nd client (not a member of C's org) ──
  const D = await register('[SIM] Persona D Outsider');
  const Dt = await token(['seller', 'customer'], D);

  const personas = {
    supabaseCookieName: 'sb-localhost-auth-token',
    personas: {
      A: { label: 'Buyer + Seller', token: At, customerId: A, clientRef: await clientRef(At) },
      B: { label: 'Multi-currency', token: Bt, customerId: B, clientRef: await clientRef(Bt) },
      C: {
        label: 'Organisation member',
        token: Ct,
        customerId: C,
        clientRef: await clientRef(Ct),
        orgId: org.id,
        orgName: '[SIM] Northgate Traders',
      },
      D: {
        label: 'Unauthorized outsider',
        token: Dt,
        customerId: D,
        clientRef: await clientRef(Dt),
        foreignOrgId: org.id,
      },
    },
  };
  writeFileSync(OUT, JSON.stringify(personas, null, 2));
  console.log('wrote', OUT);
  console.log('A', A, 'B', B, 'C', C, 'org', org.id, 'D', D);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
