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
