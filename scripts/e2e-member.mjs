#!/usr/bin/env node
/**
 * Member identity, credit, security & performance E2E (Revision 05 §27). Boots the
 * built API against DATABASE_URL and proves the whole engine against a real DB:
 *   - Client ID: unique/sequential under concurrent registration, stable, one
 *     durable Customer for Buyer+Seller.
 *   - Security: pending = 0 eligible; verified contributes; expired stops new
 *     credit; private guarantee doc never in the customer view; unauthorized staff
 *     cannot verify.
 *   - Configurable 5% rule: 500,000 → 10,000,000 at 5%, 5,000,000 at 10%.
 *   - Credit: manual cap; available = approved − committed; AAL2 on approval.
 *   - Exposure gate in the auction engine: over-limit bid → CREDIT_LIMIT_EXCEEDED;
 *     two simultaneous bids cannot over-reserve; outbid releases, won converts.
 *   - Temporary onsite grant. Performance deterministic + INSUFFICIENT_HISTORY.
 *   - Flags/score are private (customer never sees them; unauthorized staff 403).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

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
const get = (p, o) => req('GET', p, o);
const post = (p, o) => req('POST', p, o);

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

const token = async (roles, customerId, aal = 'aal1') =>
  (
    await post('/dev/token', {
      body: { roles, aal, ...(customerId ? { customerId } : {}) },
    })
  ).json?.token;
const registerCustomer = async (label) =>
  (
    await post('/customers', {
      body: { legalName: label, email: `${label}${Date.now()}${Math.random()}@ex.com` },
    })
  ).json;

async function makeListing(sellerToken) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Hilux', year: 2021 } },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: {
      assetId: asset.json.id,
      saleMethod: 'TIMED_AUCTION',
      publicRef: `MBR-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
    },
  });
  return listing.json.id;
}
async function openAuction(staffToken, sellerToken) {
  const listingId = await makeListing(sellerToken);
  const now = Date.now();
  const a = await post('/auctions', {
    token: staffToken,
    body: {
      listingId,
      startsAt: new Date(now - 1000).toISOString(),
      endsAt: new Date(now + 5 * 60_000).toISOString(),
      openingBidMinor: 100_000,
      incrementMinor: 10_000,
      reserveMinor: 100_000,
    },
  });
  await post(`/auctions/${a.json.id}/open`, { token: staffToken });
  return a.json.id;
}
async function openAuctionInEvent(staffToken, sellerToken, eventId, sequence) {
  const listingId = await makeListing(sellerToken);
  await post(`/events/${eventId}/lots`, {
    token: staffToken,
    body: { listingId, sequence, lane: 'A' },
  });
  const now = Date.now();
  const a = await post('/auctions', {
    token: staffToken,
    body: {
      listingId,
      startsAt: new Date(now - 1000).toISOString(),
      endsAt: new Date(now + 5 * 60_000).toISOString(),
      openingBidMinor: 100_000,
      incrementMinor: 10_000,
      reserveMinor: 100_000,
    },
  });
  await post(`/auctions/${a.json.id}/open`, { token: staffToken });
  return a.json.id;
}
async function makeBuyNowListing(sellerToken, staffToken, priceMinor) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: { category: 'vehicles', attributes: { make: 'BN', model: 'X', year: 2022 } },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: {
      assetId: asset.json.id,
      saleMethod: 'BUY_NOW',
      publicRef: `BN-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
    },
  });
  await post(`/exchange/listings/${listing.json.id}/buy-now-price`, {
    token: staffToken,
    body: { amountMinor: priceMinor, currency: 'LKR' },
  });
  return listing.json.id;
}

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEATURE_BUY_NOW: 'true' },
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));

  try {
    if (!(await waitForHealth())) {
      console.error('API did not start:\n' + logs.join(''));
      process.exit(1);
    }

    const admin = await token(['admin'], null, 'aal2');
    const adminNoMfa = await token(['admin'], null, 'aal1');
    const sellerCust = await registerCustomer('seller');
    const sellerToken = await token(['seller'], sellerCust.id);
    const staffToken = await token(['auction_staff'], null, 'aal2');

    // --- Client ID -----------------------------------------------------------
    const c1 = await registerCustomer('alpha');
    const c2 = await registerCustomer('beta');
    check(
      /^CUS-\d{6}$/.test(c1.clientReference),
      `Client ID format CUS-###### (${c1.clientReference})`,
    );
    check(
      c1.clientReference !== c2.clientReference,
      `sequential registrations get distinct Client IDs (${c1.clientReference} vs ${c2.clientReference})`,
    );
    // Concurrent registration must not collide.
    const burst = await Promise.all(
      Array.from({ length: 6 }, (_, i) => registerCustomer(`burst${i}`)),
    );
    const refs = new Set(burst.map((b) => b.clientReference));
    check(refs.size === 6, `6 concurrent registrations → 6 unique Client IDs (got ${refs.size})`);

    // One durable Customer is Buyer + Seller (derived, not duplicated).
    const bothCust = c1;
    const bothToken = await token(['customer'], bothCust.id);
    await post('/assets', {
      token: await token(['seller'], bothCust.id),
      body: { category: 'vehicles', attributes: { make: 'X', model: 'Y', year: 2020 } },
    });
    const selfBoth = await get('/me/member', { token: bothToken });
    check(
      Array.isArray(selfBoth.json?.roles) &&
        selfBoth.json.roles.includes('buyer') &&
        selfBoth.json.roles.includes('seller'),
      `one Customer is Buyer+Seller (roles=${selfBoth.json?.roles})`,
    );
    check(
      selfBoth.json?.clientReference === bothCust.clientReference,
      'Client ID stable across reads',
    );

    // --- Security eligibility + configurable 5% rule -------------------------
    const cust5 = await registerCustomer('five');
    const token5 = await token(['customer'], cust5.id);
    // Submit a 500,000.00 (50,000,000 minor) cash deposit — pending → 0 eligible.
    const dep = await post('/members/security', {
      token: admin,
      body: { customerId: cust5.id, type: 'cash_deposit', faceAmountMinor: 50_000_000 },
    });
    check(dep.status === 201, `staff submits security (${dep.status})`);
    let self5 = await get('/me/member', { token: token5 });
    check(
      self5.json?.bidCapacity?.availableMinor === 0,
      `pending deposit → 0 available (${self5.json?.bidCapacity?.availableMinor})`,
    );
    // Unauthorized staff (plain customer) cannot verify.
    const badVerify = await post(`/members/security/${dep.json.id}/verify`, {
      token: token5,
      body: { decision: 'verify' },
    });
    check(badVerify.status === 403, `customer cannot verify security → 403 (${badVerify.status})`);
    // Verify, then approve credit at 5% (500 bps).
    check(
      (
        await post(`/members/security/${dep.json.id}/verify`, {
          token: admin,
          body: { decision: 'verify' },
        })
      ).status === 201,
      'staff verifies security (AAL2)',
    );
    // AAL2: approval without MFA is refused.
    const noMfa = await post('/members/credit/approve', {
      token: adminNoMfa,
      body: { customerId: cust5.id, requiredSecurityBps: 500 },
    });
    check(
      noMfa.status === 403 && noMfa.json?.code === 'MFA_REQUIRED',
      `credit approval without AAL2 → MFA_REQUIRED (${noMfa.status}/${noMfa.json?.code})`,
    );
    const approve5 = await post('/members/credit/approve', {
      token: admin,
      body: { customerId: cust5.id, requiredSecurityBps: 500 },
    });
    check(
      approve5.json?.approvedLimitMinor === 1_000_000_000,
      `5% rule: 500,000 security → 10,000,000 limit (${approve5.json?.approvedLimitMinor})`,
    );
    self5 = await get('/me/member', { token: token5 });
    check(
      self5.json?.bidCapacity?.approvedMinor === 1_000_000_000 &&
        self5.json?.bidCapacity?.availableMinor === 1_000_000_000,
      `available = approved − committed after approval (${self5.json?.bidCapacity?.availableMinor})`,
    );
    check(
      self5.json?.security?.every((s) => !('documentMediaId' in s)),
      'customer security summary omits private document reference',
    );

    // Same security at 10% → half the limit.
    const cust10 = await registerCustomer('ten');
    const dep10 = await post('/members/security', {
      token: admin,
      body: { customerId: cust10.id, type: 'cash_deposit', faceAmountMinor: 50_000_000 },
    });
    await post(`/members/security/${dep10.json.id}/verify`, {
      token: admin,
      body: { decision: 'verify' },
    });
    const approve10 = await post('/members/credit/approve', {
      token: admin,
      body: { customerId: cust10.id, requiredSecurityBps: 1000 },
    });
    check(
      approve10.json?.approvedLimitMinor === 500_000_000,
      `10% rule: same security → 5,000,000 limit (${approve10.json?.approvedLimitMinor})`,
    );

    // Expired bank guarantee stops new supported credit (contributes 0).
    const custBg = await registerCustomer('bg');
    const bg = await post('/members/security', {
      token: admin,
      body: {
        customerId: custBg.id,
        type: 'bank_guarantee',
        faceAmountMinor: 500_000_000,
        issuingBank: 'Commercial Bank',
        expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    });
    await post(`/members/security/${bg.json.id}/verify`, {
      token: admin,
      body: { decision: 'verify' },
    });
    const approveBg = await post('/members/credit/approve', {
      token: admin,
      body: { customerId: custBg.id, requiredSecurityBps: 500 },
    });
    check(
      approveBg.json?.approvedLimitMinor === 0,
      `expired guarantee supports 0 new credit (${approveBg.json?.approvedLimitMinor})`,
    );

    // --- Exposure gate in the auction engine ---------------------------------
    // Customer with a capped facility of 10,000.00 (1,000,000 minor).
    const custBid = await registerCustomer('bidder');
    const bidToken = await token(['customer'], custBid.id);
    const depB = await post('/members/security', {
      token: admin,
      body: { customerId: custBid.id, type: 'cash_deposit', faceAmountMinor: 100_000 },
    });
    await post(`/members/security/${depB.json.id}/verify`, {
      token: admin,
      body: { decision: 'verify' },
    });
    await post('/members/credit/approve', {
      token: admin,
      body: { customerId: custBid.id, requiredSecurityBps: 500, approvedLimitMinor: 1_000_000 },
    });
    const lot1 = await openAuction(staffToken, sellerToken);
    const lot2 = await openAuction(staffToken, sellerToken);
    const bid1 = await post(`/auctions/${lot1}/bids`, {
      token: bidToken,
      body: { maxAmountMinor: 800_000 },
    });
    check(bid1.status === 201, `bid within capacity accepted (${bid1.status})`);
    const bid2 = await post(`/auctions/${lot2}/bids`, {
      token: bidToken,
      body: { maxAmountMinor: 300_000 },
    });
    check(
      bid2.status === 403 && bid2.json?.code === 'CREDIT_LIMIT_EXCEEDED',
      `over-capacity bid → CREDIT_LIMIT_EXCEEDED (${bid2.status}/${bid2.json?.code})`,
    );
    const selfBid = await get('/me/member', { token: bidToken });
    check(
      selfBid.json?.bidCapacity?.committedMinor === 800_000 &&
        selfBid.json?.bidCapacity?.availableMinor === 200_000,
      `committed 800k / available 200k after one reserve (c=${selfBid.json?.bidCapacity?.committedMinor})`,
    );

    // Concurrency: two simultaneous bids for one customer that each need 800k of a
    // 1,000,000 line — exactly one may reserve.
    const custRace = await registerCustomer('race');
    const raceToken = await token(['customer'], custRace.id);
    const depR = await post('/members/security', {
      token: admin,
      body: { customerId: custRace.id, type: 'cash_deposit', faceAmountMinor: 100_000 },
    });
    await post(`/members/security/${depR.json.id}/verify`, {
      token: admin,
      body: { decision: 'verify' },
    });
    await post('/members/credit/approve', {
      token: admin,
      body: { customerId: custRace.id, requiredSecurityBps: 500, approvedLimitMinor: 1_000_000 },
    });
    const raceLot1 = await openAuction(staffToken, sellerToken);
    const raceLot2 = await openAuction(staffToken, sellerToken);
    const race = await Promise.all([
      post(`/auctions/${raceLot1}/bids`, { token: raceToken, body: { maxAmountMinor: 800_000 } }),
      post(`/auctions/${raceLot2}/bids`, { token: raceToken, body: { maxAmountMinor: 800_000 } }),
    ]);
    const accepted = race.filter((r) => r.status === 201).length;
    const exceeded = race.filter(
      (r) => r.status === 403 && r.json?.code === 'CREDIT_LIMIT_EXCEEDED',
    ).length;
    check(accepted === 1, `concurrent bids: exactly one reserves capacity (got ${accepted})`);
    check(exceeded === 1, `concurrent bids: the other is CREDIT_LIMIT_EXCEEDED (got ${exceeded})`);
    const selfRace = await get('/me/member', { token: raceToken });
    check(
      selfRace.json?.bidCapacity?.availableMinor >= 0,
      `no negative available credit after race (${selfRace.json?.bidCapacity?.availableMinor})`,
    );

    // Won converts / loser releases at close.
    const closeLot = await openAuction(staffToken, sellerToken);
    const winnerCust = await registerCustomer('winner');
    const winnerToken = await token(['customer'], winnerCust.id);
    const depW = await post('/members/security', {
      token: admin,
      body: { customerId: winnerCust.id, type: 'cash_deposit', faceAmountMinor: 100_000 },
    });
    await post(`/members/security/${depW.json.id}/verify`, {
      token: admin,
      body: { decision: 'verify' },
    });
    await post('/members/credit/approve', {
      token: admin,
      body: { customerId: winnerCust.id, requiredSecurityBps: 500, approvedLimitMinor: 1_000_000 },
    });
    await post(`/auctions/${closeLot}/bids`, {
      token: winnerToken,
      body: { maxAmountMinor: 500_000 },
    });
    await post(`/auctions/${closeLot}/close`, { token: staffToken });
    const selfWinner = await get('/me/member', { token: winnerToken });
    check(
      selfWinner.json?.bidCapacity?.committedMinor === 500_000,
      `won bid converts to purchase exposure (still committed ${selfWinner.json?.bidCapacity?.committedMinor})`,
    );

    // §3 (P0): converted unpaid exposure must be counted at NEW bid admission —
    // winning does not hand capacity back. Winner has approved 1,000,000 with
    // 500,000 committed as a converted purchase → only 500,000 available.
    const newLot = await openAuction(staffToken, sellerToken);
    const overBid = await post(`/auctions/${newLot}/bids`, {
      token: winnerToken,
      body: { maxAmountMinor: 600_000 },
    });
    check(
      overBid.status === 403 && overBid.json?.code === 'CREDIT_LIMIT_EXCEEDED',
      `converted unpaid exposure counted at admission → new 600k bid rejected (${overBid.status}/${overBid.json?.code})`,
    );
    const okBid = await post(`/auctions/${newLot}/bids`, {
      token: winnerToken,
      body: { maxAmountMinor: 400_000 },
    });
    check(
      okBid.status === 201,
      `a 400k bid within the remaining capacity is accepted after winning (${okBid.status})`,
    );

    // --- §5 (P0): block security release while obligations exist --------------
    const custRel = await registerCustomer('release');
    const relToken = await token(['customer'], custRel.id);
    const secRel = await post('/members/security', {
      token: admin,
      body: { customerId: custRel.id, type: 'cash_deposit', faceAmountMinor: 50_000 },
    });
    await post(`/members/security/${secRel.json.id}/verify`, {
      token: admin,
      body: { decision: 'verify' },
    });
    await post('/members/credit/approve', {
      token: admin,
      body: { customerId: custRel.id, requiredSecurityBps: 500, approvedLimitMinor: 1_000_000 },
    });
    const relLot = await openAuction(staffToken, sellerToken);
    await post(`/auctions/${relLot}/bids`, { token: relToken, body: { maxAmountMinor: 300_000 } });

    // Release is blocked while an active reservation depends on the security.
    const blockedRelease = await post(`/members/security/${secRel.json.id}/release`, {
      token: admin,
      body: { reason: 'customer requested' },
    });
    check(
      blockedRelease.status === 409 && blockedRelease.json?.code === 'OUTSTANDING_EXPOSURE',
      `security release blocked by active exposure → OUTSTANDING_EXPOSURE (${blockedRelease.status}/${blockedRelease.json?.code})`,
    );

    // Unauthorized actor cannot release.
    const relForbidden = await post(`/members/security/${secRel.json.id}/release`, {
      token: relToken,
      body: { reason: 'x' },
    });
    check(
      relForbidden.status === 403,
      `customer cannot release security → 403 (${relForbidden.status})`,
    );

    // Outbid + close releases the loser's reservation → exposure clears.
    const outbidder = await registerCustomer('outbidder');
    await post(`/auctions/${relLot}/bids`, {
      token: await token(['customer'], outbidder.id),
      body: { maxAmountMinor: 500_000 },
    });
    await post(`/auctions/${relLot}/close`, { token: staffToken });
    const relSelf = await get('/me/member', { token: relToken });
    check(
      relSelf.json?.bidCapacity?.committedMinor === 0,
      `losing bidder exposure released at close (committed ${relSelf.json?.bidCapacity?.committedMinor})`,
    );

    // With no outstanding exposure, release now succeeds.
    const allowedRelease = await post(`/members/security/${secRel.json.id}/release`, {
      token: admin,
      body: { reason: 'cleared' },
    });
    check(
      allowedRelease.status === 201 && allowedRelease.json?.status === 'released',
      `security release allowed once exposure cleared (${allowedRelease.status}/${allowedRelease.json?.status})`,
    );

    // --- §4 (P0): temporary facility scope enforced at bid time ---------------
    const futureIso = () => new Date(Date.now() + 3_600_000).toISOString();

    // AUCTION scope: capacity for auctionX works only in auctionX.
    const scopeCust = await registerCustomer('scoped');
    const scopeTok = await token(['customer'], scopeCust.id);
    const auctionX = await openAuction(staffToken, sellerToken);
    const auctionZ = await openAuction(staffToken, sellerToken);
    await post('/members/temporary-grant', {
      token: staffToken,
      body: {
        customerId: scopeCust.id,
        scopeType: 'auction',
        scopeId: auctionX,
        spotDepositMinor: 50_000,
        requiredSecurityBps: 500,
        expiresAt: futureIso(),
        reason: 'auction scope',
      },
    });
    check(
      (
        await post(`/auctions/${auctionX}/bids`, {
          token: scopeTok,
          body: { maxAmountMinor: 300_000 },
        })
      ).status === 201,
      'auction-scoped capacity works in its own auction',
    );
    const outOfScope = await post(`/auctions/${auctionZ}/bids`, {
      token: scopeTok,
      body: { maxAmountMinor: 100_000 },
    });
    check(
      outOfScope.status === 403 && outOfScope.json?.code === 'AUCTION_REGISTRATION_REQUIRED',
      `auction-scoped capacity rejected in another auction (${outOfScope.status}/${outOfScope.json?.code})`,
    );

    // EVENT scope: capacity for Event A works on a lot in Event A, not outside it.
    const eventA = await post('/events', {
      token: staffToken,
      body: { publicRef: `EVA-${Date.now()}`, title: 'Scope Event A' },
    });
    const evtCust = await registerCustomer('evt');
    const evtTok = await token(['customer'], evtCust.id);
    const lotInA = await openAuctionInEvent(staffToken, sellerToken, eventA.json.id, 1);
    const lotOutside = await openAuction(staffToken, sellerToken);
    await post('/members/temporary-grant', {
      token: staffToken,
      body: {
        customerId: evtCust.id,
        scopeType: 'event',
        scopeId: eventA.json.id,
        spotDepositMinor: 50_000,
        requiredSecurityBps: 500,
        expiresAt: futureIso(),
        reason: 'event scope',
      },
    });
    check(
      (await post(`/auctions/${lotInA}/bids`, { token: evtTok, body: { maxAmountMinor: 300_000 } }))
        .status === 201,
      'event-scoped capacity works on a lot in that event',
    );
    const evtOut = await post(`/auctions/${lotOutside}/bids`, {
      token: evtTok,
      body: { maxAmountMinor: 100_000 },
    });
    check(
      evtOut.status === 403 && evtOut.json?.code === 'AUCTION_REGISTRATION_REQUIRED',
      `event-scoped capacity rejected outside the event (${evtOut.status}/${evtOut.json?.code})`,
    );

    // Expired temporary grant denies new bids deterministically.
    const expCust = await registerCustomer('expscope');
    const expTok = await token(['customer'], expCust.id);
    const expLot = await openAuction(staffToken, sellerToken);
    await post('/members/temporary-grant', {
      token: staffToken,
      body: {
        customerId: expCust.id,
        scopeType: 'auction',
        scopeId: expLot,
        spotDepositMinor: 50_000,
        requiredSecurityBps: 500,
        expiresAt: new Date(Date.now() + 1200).toISOString(),
        reason: 'about to expire',
      },
    });
    await sleep(1600);
    const expBid = await post(`/auctions/${expLot}/bids`, {
      token: expTok,
      body: { maxAmountMinor: 100_000 },
    });
    check(
      expBid.status === 403 && expBid.json?.code === 'TEMPORARY_ACCESS_EXPIRED',
      `expired temporary grant → TEMPORARY_ACCESS_EXPIRED (${expBid.status}/${expBid.json?.code})`,
    );

    // Deterministic selection: an AUCTION-specific facility is chosen over a larger
    // PLATFORM one (no aggregation) — a bid over the specific cap is rejected even
    // though the platform facility could cover it.
    const detCust = await registerCustomer('determ');
    const detTok = await token(['customer'], detCust.id);
    const detAuction = await openAuction(staffToken, sellerToken);
    const detSec = await post('/members/security', {
      token: admin,
      body: { customerId: detCust.id, type: 'cash_deposit', faceAmountMinor: 1_000_000 },
    });
    await post(`/members/security/${detSec.json.id}/verify`, {
      token: admin,
      body: { decision: 'verify' },
    });
    await post('/members/credit/approve', {
      token: admin,
      body: { customerId: detCust.id, requiredSecurityBps: 500, approvedLimitMinor: 10_000_000 },
    });
    await post('/members/temporary-grant', {
      token: staffToken,
      body: {
        customerId: detCust.id,
        scopeType: 'auction',
        scopeId: detAuction,
        spotDepositMinor: 50_000,
        requiredSecurityBps: 500,
        expiresAt: futureIso(),
        reason: 'determ',
      },
    });
    check(
      (
        await post(`/auctions/${detAuction}/bids`, {
          token: detTok,
          body: { maxAmountMinor: 800_000 },
        })
      ).status === 201,
      'deterministic: a bid within the auction-specific facility is accepted',
    );
    const detOver = await post(`/auctions/${detAuction}/bids`, {
      token: detTok,
      body: { maxAmountMinor: 1_500_000 },
    });
    check(
      detOver.status === 403 && detOver.json?.code === 'CREDIT_LIMIT_EXCEEDED',
      `deterministic: most-specific facility chosen (not aggregated) → over-cap bid rejected (${detOver.status}/${detOver.json?.code})`,
    );

    // --- §6 (P0): supporting-security expiry revalidated at bid time ----------
    const bgCust = await registerCustomer('bgexpiry');
    const bgTok = await token(['customer'], bgCust.id);
    const bgLot = await openAuction(staffToken, sellerToken);
    const bgSec = await post('/members/security', {
      token: admin,
      body: {
        customerId: bgCust.id,
        type: 'bank_guarantee',
        faceAmountMinor: 100_000,
        issuingBank: 'Test Bank',
        expiresAt: new Date(Date.now() + 2500).toISOString(),
      },
    });
    await post(`/members/security/${bgSec.json.id}/verify`, {
      token: admin,
      body: { decision: 'verify' },
    });
    await post('/members/credit/approve', {
      token: admin,
      body: { customerId: bgCust.id, requiredSecurityBps: 500, approvedLimitMinor: 1_000_000 },
    });
    check(
      (await post(`/auctions/${bgLot}/bids`, { token: bgTok, body: { maxAmountMinor: 300_000 } }))
        .status === 201,
      'valid bank guarantee supports a bid',
    );
    // Let the guarantee lapse, then a NEW bid must be denied — the lapsed BG no
    // longer backs new exposure — while the existing obligation is retained.
    await sleep(2800);
    const bgLot2 = await openAuction(staffToken, sellerToken);
    const bgAfter = await post(`/auctions/${bgLot2}/bids`, {
      token: bgTok,
      body: { maxAmountMinor: 100_000 },
    });
    check(
      bgAfter.status === 403 && bgAfter.json?.code === 'SECURITY_EXPIRED',
      `expired bank guarantee denies new exposure → SECURITY_EXPIRED (${bgAfter.status}/${bgAfter.json?.code})`,
    );
    const bgSelf = await get('/me/member', { token: bgTok });
    check(
      bgSelf.json?.bidCapacity?.committedMinor === 300_000 &&
        bgSelf.json?.bidCapacity?.availableMinor === 0,
      `BG expiry: obligation retained (committed ${bgSelf.json?.bidCapacity?.committedMinor}), new capacity zeroed (available ${bgSelf.json?.bidCapacity?.availableMinor})`,
    );

    // --- §11 (P1): binding non-auction purchase (Buy Now) enforces capacity ---
    const bnBuyer = await registerCustomer('buynow');
    const bnTok = await token(['customer'], bnBuyer.id);
    const bnSec = await post('/members/security', {
      token: admin,
      body: { customerId: bnBuyer.id, type: 'cash_deposit', faceAmountMinor: 50_000 },
    });
    await post(`/members/security/${bnSec.json.id}/verify`, {
      token: admin,
      body: { decision: 'verify' },
    });
    await post('/members/credit/approve', {
      token: admin,
      body: { customerId: bnBuyer.id, requiredSecurityBps: 500, approvedLimitMinor: 1_000_000 },
    });
    const bnListing1 = await makeBuyNowListing(sellerToken, staffToken, 800_000);
    const buy1 = await post(`/exchange/listings/${bnListing1}/buy-now`, { token: bnTok });
    check(buy1.status === 201, `credit buyer Buy Now within capacity accepted (${buy1.status})`);
    const bnSelf = await get('/me/member', { token: bnTok });
    check(
      bnSelf.json?.bidCapacity?.committedMinor === 800_000,
      `Buy Now creates committed purchase exposure (${bnSelf.json?.bidCapacity?.committedMinor})`,
    );
    const bnListing2 = await makeBuyNowListing(sellerToken, staffToken, 500_000);
    const buy2 = await post(`/exchange/listings/${bnListing2}/buy-now`, { token: bnTok });
    check(
      buy2.status === 403 && buy2.json?.code === 'CREDIT_LIMIT_EXCEEDED',
      `Buy Now over remaining capacity rejected → CREDIT_LIMIT_EXCEEDED (${buy2.status}/${buy2.json?.code})`,
    );

    // --- Temporary onsite membership -----------------------------------------
    const custTmp = await registerCustomer('tmp');
    const tmpToken = await token(['customer'], custTmp.id);
    const grant = await post('/members/temporary-grant', {
      token: staffToken,
      body: {
        customerId: custTmp.id,
        scopeType: 'event',
        scopeId: 'EVT-1',
        spotDepositMinor: 5_000_000,
        requiredSecurityBps: 500,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    check(
      grant.status === 201 && grant.json?.approvedLimitMinor === 100_000_000,
      `spot deposit 50,000 at 5% → 1,000,000 temporary capacity (${grant.json?.approvedLimitMinor})`,
    );
    const selfTmp = await get('/me/member', { token: tmpToken });
    check(
      selfTmp.json?.membership?.status === 'temporary' &&
        selfTmp.json?.temporaryAccess?.length === 1,
      `member is temporary with scoped access (${selfTmp.json?.membership?.status})`,
    );

    // --- Performance ---------------------------------------------------------
    const custPerf = await registerCustomer('perf');
    await post('/members/performance/events', {
      token: admin,
      body: {
        customerId: custPerf.id,
        context: 'buyer',
        eventType: 'PAYMENT_ON_TIME',
        dimension: 'paymentReliability',
      },
    });
    const perf1 = await post('/members/performance/recalculate', {
      token: admin,
      body: { customerId: custPerf.id, context: 'buyer' },
    });
    check(
      perf1.json?.band === 'INSUFFICIENT_HISTORY',
      `1 event → INSUFFICIENT_HISTORY (${perf1.json?.band})`,
    );
    for (const [t, d] of [
      ['PAYMENT_ON_TIME', 'paymentReliability'],
      ['PURCHASE_COMPLETED', 'settlementCompletion'],
      ['COLLECTED_ON_TIME', 'collection'],
    ]) {
      await post('/members/performance/events', {
        token: admin,
        body: { customerId: custPerf.id, context: 'buyer', eventType: t, dimension: d },
      });
    }
    const perf2 = await post('/members/performance/recalculate', {
      token: admin,
      body: { customerId: custPerf.id, context: 'buyer' },
    });
    const perf3 = await post('/members/performance/recalculate', {
      token: admin,
      body: { customerId: custPerf.id, context: 'buyer' },
    });
    check(
      typeof perf2.json?.score === 'number' && perf2.json.score === perf3.json?.score,
      `performance deterministic / rebuildable (score=${perf2.json?.score})`,
    );

    // --- Flags are private ---------------------------------------------------
    const flag = await post('/members/flags', {
      token: admin,
      body: {
        customerId: custPerf.id,
        context: 'buyer',
        category: 'payment',
        severity: 'medium',
        reasonCode: 'LATE_PAYMENT',
        title: 'Late payment on invoice',
        privateNote: 'internal only',
      },
    });
    check(flag.status === 201, `staff creates internal flag (${flag.status})`);
    const perfToken = await token(['customer'], custPerf.id);
    const selfPerf = await get('/me/member', { token: perfToken });
    check(
      selfPerf.json && !('flags' in selfPerf.json) && !('performance' in selfPerf.json),
      'customer self view exposes neither flags nor internal score',
    );
    const denied360 = await get(`/members/${custPerf.id}/360`, { token: perfToken });
    check(denied360.status === 403, `customer cannot read Member 360 → 403 (${denied360.status})`);
    const m360 = await get(`/members/${custPerf.id}/360`, { token: admin });
    check(
      Array.isArray(m360.json?.flags) && m360.json.flags.length === 1 && m360.json?.clientReference,
      `staff Member 360 shows flag + Client ID (flags=${m360.json?.flags?.length})`,
    );
    // Resolving a flag preserves history (status changes, row remains).
    await post(`/members/flags/${flag.json.id}/resolve`, {
      token: admin,
      body: { resolution: 'resolve' },
    });
    const m360b = await get(`/members/${custPerf.id}/360`, { token: admin });
    check(
      m360b.json?.flags?.[0]?.status === 'resolved',
      `flag resolution preserves the record (status=${m360b.json?.flags?.[0]?.status})`,
    );

    // --- Member search (Revision 06 P1-10/P1-11) -----------------------------
    const findable = (
      await post('/customers', {
        token: admin,
        body: {
          legalName: 'Zephyrine Testwick',
          email: `zephyrine.${Date.now()}@example.com`,
          phone: `+9477${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        },
      })
    ).json;
    const custView = await token(['customer'], findable.id);

    // Non-staff cannot search.
    check(
      (await get('/members/search?q=Zephyrine', { token: custView })).status === 403,
      'customer cannot search members → 403',
    );

    // Exact Client ID → the member ranks first; contact is masked, raw contact absent.
    const byId = await get(`/members/search?q=${findable.clientReference}`, { token: admin });
    check(byId.status === 200, `staff can search members (${byId.status})`);
    check(
      byId.json?.results?.[0]?.customerId === findable.id,
      `exact Client ID search returns the member first (${byId.json?.results?.[0]?.clientReference})`,
    );
    const top = byId.json?.results?.[0] ?? {};
    check(
      typeof top.emailMasked === 'string' &&
        top.emailMasked.includes('•') &&
        top.emailMasked !== findable.email,
      'search result masks the email (no full contact in the list)',
    );
    check(
      !('email' in top) && !('phone' in top),
      'search result never carries the raw email/phone',
    );

    // By legal name (case-insensitive substring).
    check(
      (await get('/members/search?q=zephyrine', { token: admin })).json?.results?.some(
        (r) => r.customerId === findable.id,
      ),
      'name search finds the member (case-insensitive)',
    );

    // By email.
    check(
      (
        await get(`/members/search?q=${encodeURIComponent(findable.email)}`, { token: admin })
      ).json?.results?.some((r) => r.customerId === findable.id),
      'email search finds the member',
    );

    // By mobile digits (stored with country code).
    const digits = findable.phone.replace(/\D/g, '').slice(-7);
    check(
      (await get(`/members/search?q=${digits}`, { token: admin })).json?.results?.some(
        (r) => r.customerId === findable.id,
      ),
      `mobile search finds the member (…${digits.slice(-4)})`,
    );

    // Exact Client ID outranks a member whose NAME merely equals that Client ID.
    await post('/customers', {
      token: admin,
      body: { legalName: findable.clientReference, email: `collide.${Date.now()}@example.com` },
    });
    check(
      (await get(`/members/search?q=${findable.clientReference}`, { token: admin })).json
        ?.results?.[0]?.customerId === findable.id,
      'exact Client ID ranks above a name that merely equals it',
    );

    // Too-short query → empty, not an error.
    const tiny = await get('/members/search?q=z', { token: admin });
    check(
      tiny.status === 200 && tiny.json?.results?.length === 0,
      'too-short query returns empty results, not an error',
    );

    // --- Credit policy (§8): canonical, public, versioned --------------------
    const policy = await get('/members/credit-policy');
    check(
      policy.status === 200 &&
        policy.json?.requiredSecurityBps === 500 &&
        !!policy.json?.policyVersion &&
        ['off', 'facility', 'strict'].includes(policy.json?.enforcement),
      `public credit policy: ${policy.json?.requiredSecurityBps}bps · ${policy.json?.enforcement} · ${policy.json?.policyVersion}`,
    );
    check(
      policy.json?.capacityMultiple === 20,
      `5% policy → 20x capacity multiple (${policy.json?.capacityMultiple})`,
    );
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} member E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll member E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
