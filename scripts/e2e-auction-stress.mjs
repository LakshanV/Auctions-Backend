#!/usr/bin/env node
/**
 * SINGHA — Auction stress matrix (directive §9-14). Exercises the authoritative auction engine
 * across the full scenario set A–J plus the invalid-bid taxonomy, bid privacy, scaled concurrency
 * (5/10/25) and multi-extension soft close.
 *
 * ISOLATION (directive §21): every scenario builds its OWN listing + auction under a unique
 * run id (STRESS-<ts>-…), so the immutable, append-only bid ledger is never entangled with the
 * browsable catalogue and nothing needs to be (or can be) deleted. Runs simply accumulate.
 *
 * Boots the built API against DATABASE_URL. Prints a per-scenario matrix and exits non-zero on any
 * failure so it can gate CI.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import PrismaPkg from '@prisma/client';

const { PrismaClient } = PrismaPkg;
const BASE = 'http://localhost:4000';
const API = `${BASE}/api/v1`;
const RUN = `STRESS-${Date.now()}`;
let failures = 0;
const matrix = [];

function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
  return Boolean(cond);
}
function record(scenario, ok, note) {
  matrix.push({ scenario, result: ok ? 'PASS' : 'FAIL', note: note ?? '' });
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
  (
    await post('/customers', {
      body: { legalName: `[SIM] ${label}`, email: `${label}-${RUN}@mkt.singha.local` },
    })
  ).json?.id;

let seq = 0;
async function makeAuction(sellerToken, staffToken, over = {}) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Stress', year: 2020 } },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: {
      assetId: asset.json.id,
      saleMethod: 'TIMED_AUCTION',
      publicRef: `${RUN}-${(seq += 1)}`,
    },
  });
  const now = Date.now();
  const a = await post('/auctions', {
    token: staffToken,
    body: {
      listingId: listing.json.id,
      startsAt: new Date(now - 1000).toISOString(),
      endsAt: new Date(now + 5 * 60_000).toISOString(),
      openingBidMinor: 100_000,
      incrementMinor: 10_000,
      ...over,
    },
  });
  return { auctionId: a.json?.id, listingId: listing.json.id };
}
const openAuction = (staffToken, id) => post(`/auctions/${id}/open`, { token: staffToken });
const bid = (tok, id, maxAmountMinor, extra = {}) =>
  post(`/auctions/${id}/bids`, { token: tok, body: { maxAmountMinor, ...extra } });
const state = (id) => get(`/auctions/${id}/state`);
const close = (staffToken, id) => post(`/auctions/${id}/close`, { token: staffToken });

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
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

    const sellerId = await registerCustomer('stress-seller');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff']);
    // A pool of bidder tokens for concurrency.
    const bidders = [];
    for (let i = 0; i < 25; i += 1) {
      const id = await registerCustomer(`bidder-${i}`);
      bidders.push({ id, token: await token(['customer'], id) });
    }
    const A = bidders[0],
      B = bidders[1],
      C = bidders[2];

    // --- Scenario A — normal bidding, clean winner --------------------------
    console.log('\n[A] normal bidding');
    {
      const { auctionId } = await makeAuction(sellerToken, staffToken);
      await openAuction(staffToken, auctionId);
      await bid(A.token, auctionId, 150_000);
      await bid(B.token, auctionId, 250_000);
      const st = await state(auctionId);
      const cl = await close(staffToken, auctionId);
      const ok =
        check(cl.json?.status === 'closed', `A: closed (got ${cl.json?.status})`) &
        check(cl.json?.winnerCustomerId === B.id, 'A: highest bidder wins') &
        check(
          st.json?.currentBidMinor === 160_000,
          `A: price = 160000 (got ${st.json?.currentBidMinor})`,
        );
      record('Normal auction', ok);
    }

    // --- Scenario B — reserve met (bidding starts below reserve, then meets it) --
    console.log('\n[B] reserve met');
    {
      // Reserve 250k sits ABOVE the 100k opening: a single bidder would pass in. Competition
      // pushes the price up until the reserve is met, then a winner is produced.
      const { auctionId } = await makeAuction(sellerToken, staffToken, { reserveMinor: 250_000 });
      await openAuction(staffToken, auctionId);
      const b1 = await bid(B.token, auctionId, 300_000); // B leads at opening 100k — still below reserve
      check(
        b1.json?.currentBidMinor === 100_000,
        `B: opens below reserve (price ${b1.json?.currentBidMinor})`,
      );
      await bid(A.token, auctionId, 500_000); // A outbids -> price 310k, now >= reserve
      const st = await state(auctionId);
      const cl = await close(staffToken, auctionId);
      const ok =
        check(
          st.json?.currentBidMinor >= 250_000,
          `B: price met reserve (${st.json?.currentBidMinor} >= 250000)`,
        ) & check(cl.json?.winnerCustomerId === A.id, 'B: reserve met -> sold to highest');
      record('Reserve met', ok);
    }

    // --- Scenario C — reserve NOT met ---------------------------------------
    console.log('\n[C] reserve not met');
    {
      const { auctionId } = await makeAuction(sellerToken, staffToken, { reserveMinor: 900_000 });
      await openAuction(staffToken, auctionId);
      await bid(A.token, auctionId, 150_000);
      const cl = await close(staffToken, auctionId);
      record(
        'Reserve not met',
        check(
          cl.json?.status === 'closed' && !cl.json?.winnerCustomerId,
          'C: passed in, no winner',
        ),
      );
    }

    // --- Scenario D — proxy bidding, 3 bidders (privacy) --------------------
    console.log('\n[D] proxy bidding A=1.0M B=1.2M C=1.1M');
    {
      const { auctionId } = await makeAuction(sellerToken, staffToken);
      await openAuction(staffToken, auctionId);
      const rA = await bid(A.token, auctionId, 1_000_000);
      const rC = await bid(C.token, auctionId, 1_100_000);
      const rB = await bid(B.token, auctionId, 1_200_000);
      const st = await state(auctionId);
      // Highest max (B) must lead; no response may reveal a rival's maximum.
      const leak = [
        JSON.stringify(rA.json),
        JSON.stringify(rC.json),
        JSON.stringify(rB.json),
        JSON.stringify(st.json),
      ].join(' ');
      const ok =
        check(rB.json?.youLead === true, 'D: highest max (B) leads') &
        check(
          !/1000000|1100000|1200000/.test(leak.replace(/"currentBidMinor":\d+/g, '')),
          'D: no rival proxy maximum leaked in any payload',
        ) &
        check(
          !/proxyMax|maxAmountMinor|bidderMax/i.test(leak),
          'D: no proxy-max field name exposed',
        );
      const cl = await close(staffToken, auctionId);
      check(cl.json?.winnerCustomerId === B.id, 'D: B wins on proxy');
      record('Proxy bidding', ok);
    }

    // --- Scenario E — equal proxy maxima (deterministic tie) ----------------
    console.log('\n[E] equal proxy maxima');
    {
      const { auctionId } = await makeAuction(sellerToken, staffToken);
      await openAuction(staffToken, auctionId);
      const r1 = await bid(A.token, auctionId, 500_000);
      const r2 = await bid(B.token, auctionId, 500_000);
      // First to set the max holds the lead at an equal maximum (deterministic).
      const ok =
        check(r1.json?.youLead === true, 'E: first equal-max bidder leads') &
        check(r2.json?.youLead === false, 'E: second equal-max bidder does not steal the lead');
      record('Equal proxy maxima', ok);
    }

    // --- Scenario F — soft close, multiple extensions -----------------------
    console.log('\n[F] soft-close multi-extension');
    {
      const { auctionId } = await makeAuction(sellerToken, staffToken, {
        endsAt: new Date(Date.now() + 6_000).toISOString(),
        softCloseTriggerSec: 30,
        softCloseExtendSec: 30,
      });
      await openAuction(staffToken, auctionId);
      let extended = 0;
      let last = new Date((await state(auctionId)).json.endsAt).getTime();
      for (let i = 0; i < 3; i += 1) {
        await bid(bidders[i].token, auctionId, 150_000 + i * 20_000);
        const end = new Date((await state(auctionId)).json.endsAt).getTime();
        if (end > last) extended += 1;
        last = end;
      }
      const st = await state(auctionId);
      record(
        'Soft close',
        check(
          extended >= 3 && st.json?.extendedCount >= 3,
          `F: extended ${extended}x (count=${st.json?.extendedCount})`,
        ),
      );
    }

    // --- Scenario G — final-second concurrency (5, 10, 25) ------------------
    console.log('\n[G] concurrency 5/10/25');
    {
      let allOk = 1;
      for (const n of [5, 10, 25]) {
        const { auctionId } = await makeAuction(sellerToken, staffToken);
        await openAuction(staffToken, auctionId);
        // n distinct bidders fire simultaneously with increasing maxima.
        const results = await Promise.all(
          Array.from({ length: n }, (_, i) =>
            bid(bidders[i].token, auctionId, 200_000 + i * 5_000),
          ),
        );
        const accepted = results.filter((r) => r.status === 201).length;
        const server5xx = results.filter((r) => r.status >= 500).length;
        const st = await state(auctionId);
        const cl = await close(staffToken, auctionId);
        // Exactly one authoritative state, exactly one winner, ledger == accepted, no 5xx.
        const bidRows = await prisma.bid.count({ where: { auctionId } });
        const ok =
          check(server5xx === 0, `G(${n}): no server errors`) &
          check(typeof st.json?.currentBidMinor === 'number', `G(${n}): one authoritative price`) &
          check(
            bidRows === accepted,
            `G(${n}): ledger rows (${bidRows}) == accepted (${accepted})`,
          ) &
          check(!!cl.json?.winnerCustomerId, `G(${n}): exactly one winner`) &
          check(cl.json?.status === 'closed', `G(${n}): closed once`);
        allOk &= ok;
      }
      record('Concurrent bidding', allOk);
    }

    // --- Scenario H — invalid low bid + taxonomy ----------------------------
    console.log('\n[H] invalid-bid taxonomy');
    {
      const { auctionId } = await makeAuction(sellerToken, staffToken);
      await openAuction(staffToken, auctionId);
      await bid(A.token, auctionId, 300_000); // establish price 100000, A leads
      const low = await bid(B.token, auctionId, 50_000); // below minimum
      const zero = await bid(B.token, auctionId, 0);
      const neg = await bid(B.token, auctionId, -100_000);
      const huge = await bid(B.token, auctionId, Number.MAX_SAFE_INTEGER);
      const malformed = await post(`/auctions/${auctionId}/bids`, {
        token: B.token,
        body: { maxAmountMinor: '1.5e6' },
      });
      const ok =
        check(low.status === 400, `H: below-minimum -> 400 (got ${low.status})`) &
        check(zero.status === 400, `H: zero -> 400 (got ${zero.status})`) &
        check(neg.status === 400, `H: negative -> 400 (got ${neg.status})`) &
        check(malformed.status === 400, `H: malformed decimal -> 400 (got ${malformed.status})`) &
        check(
          huge.status === 201 || huge.status === 400,
          `H: huge boundary handled (got ${huge.status})`,
        );
      record('Invalid low bid', ok);
    }

    // --- Scenario I — stale client -----------------------------------------
    console.log('\n[I] stale client');
    {
      const { auctionId } = await makeAuction(sellerToken, staffToken);
      await openAuction(staffToken, auctionId);
      const s0 = await state(auctionId); // price 100000 (opening)
      await bid(A.token, auctionId, 400_000); // A moves the price to 100000, leads with proxy
      await bid(B.token, auctionId, 500_000); // B outbids -> price rises
      // Stale client bids at the price it originally loaded (opening) -> must be repriced/rejected.
      const stale = await bid(C.token, auctionId, Number(s0.json.currentBidMinor));
      record(
        'Stale bid',
        check(
          stale.status === 400,
          `I: stale opening-price bid rejected -> 400 (got ${stale.status})`,
        ),
      );
    }

    // --- Scenario J — duplicate submission (idempotency) --------------------
    console.log('\n[J] duplicate idempotency-key submission');
    {
      const { auctionId } = await makeAuction(sellerToken, staffToken);
      await openAuction(staffToken, auctionId);
      const key = `idem-${RUN}`;
      const r1 = await bid(A.token, auctionId, 250_000, { idempotencyKey: key });
      const r2 = await bid(A.token, auctionId, 250_000, { idempotencyKey: key });
      const r3 = await bid(A.token, auctionId, 250_000, { idempotencyKey: key });
      const rows = await prisma.bid.count({ where: { auctionId, bidderId: A.id } });
      const ok =
        check(
          [r1, r2, r3].every((r) => r.status === 201),
          'J: repeated idempotent submits all 2xx',
        ) & check(rows === 1, `J: exactly ONE effective bid row (got ${rows})`);
      record('Duplicate bid', ok);
    }

    // --- Auth/state guards --------------------------------------------------
    console.log('\n[K] auth + lifecycle guards');
    {
      const { auctionId } = await makeAuction(sellerToken, staffToken); // scheduled, NOT opened
      const notStarted = await bid(A.token, auctionId, 200_000);
      await openAuction(staffToken, auctionId);
      const noRole = await token([], A.id);
      const unauthorized = await bid(noRole, auctionId, 200_000);
      const anon = await post(`/auctions/${auctionId}/bids`, { body: { maxAmountMinor: 200_000 } });
      await close(staffToken, auctionId);
      const closedBid = await bid(A.token, auctionId, 300_000);
      const ok =
        check(notStarted.status === 409, `K: bid before open -> 409 (got ${notStarted.status})`) &
        check(
          unauthorized.status === 403,
          `K: no bid:place permission -> 403 (got ${unauthorized.status})`,
        ) &
        check(
          anon.status === 401 || anon.status === 403,
          `K: unauthenticated -> 401/403 (got ${anon.status})`,
        ) &
        check(closedBid.status === 409, `K: bid after close -> 409 (got ${closedBid.status})`);
      record('Closed auction', ok);
    }

    // --- Bid privacy (mandatory, directive §11) -----------------------------
    console.log('\n[P] bid privacy');
    {
      const { auctionId } = await makeAuction(sellerToken, staffToken, { reserveMinor: 800_000 });
      await openAuction(staffToken, auctionId);
      await bid(A.token, auctionId, 1_500_000); // hidden proxy max
      await bid(B.token, auctionId, 300_000);
      const stAnon = await get(`/auctions/${auctionId}/state`); // public/anon view
      const stOther = await state(auctionId);
      const blob = JSON.stringify(stAnon.json) + JSON.stringify(stOther.json);
      const ok =
        check(!/1500000/.test(blob), 'P: winning bidder proxy maximum (1,500,000) never exposed') &
        check(
          !/800000/.test(blob.replace(/"currentBidMinor":\d+/g, '')),
          'P: hidden reserve (800,000) never exposed',
        ) &
        check(
          !/proxyMax|maxAmountMinor|bidderMax|reserveMinor/i.test(blob),
          'P: no confidential field names in public state',
        ) &
        check(
          !new RegExp(`"${A.id}"|"${B.id}"`).test(JSON.stringify(stAnon.json)),
          'P: no internal bidder database ids in public state',
        );
      record('Bid privacy', ok);
    }

    // --- Scenario R — close/bid race + double-close idempotency (regression) --
    // Root cause once: close() decided winner/hammer/Sale from a STALE pre-transaction read
    // (no FOR UPDATE, no in-tx re-read), so a concurrent final bid could commit in between and
    // the append-only Sale ledger recorded the WRONG buyer/price (rule 12); two concurrent
    // closes on an unsold auction both ran and emitted duplicate AuctionClosed events / released
    // credit twice. Fixed by locking + re-reading the auction inside the tx (mirroring placeBid).
    console.log('\n[R] close/bid race + double-close idempotency');
    {
      let raceOk = 1;
      for (let i = 0; i < 12; i += 1) {
        const { auctionId, listingId } = await makeAuction(sellerToken, staffToken);
        await openAuction(staffToken, auctionId);
        await bid(A.token, auctionId, 150_000); // A leads at opening 100000
        // Close and a higher bid fire at the same instant.
        const [cl, b] = await Promise.all([
          close(staffToken, auctionId),
          bid(B.token, auctionId, 500_000),
        ]);
        raceOk &= check(cl.status < 500 && b.status < 500, `R${i}: no 5xx on close/bid race`);
        const auc = await prisma.auction.findUnique({ where: { id: auctionId } });
        const sales = await prisma.sale.findMany({ where: { listingId } });
        raceOk &= check(sales.length <= 1, `R${i}: at most one Sale (got ${sales.length})`);
        if (auc.winnerCustomerId) {
          const sale = sales[0];
          // THE invariant the P0 broke: the authoritative Sale must reflect the current head,
          // not a stale snapshot — buyer == winner == highBidder and amount == current price.
          raceOk &= check(
            !!sale &&
              sale.buyerCustomerId === auc.winnerCustomerId &&
              auc.winnerCustomerId === auc.highBidderId &&
              Number(sale.amountMinor) === Number(auc.currentBidMinor),
            `R${i}: Sale ledger agrees with the authoritative head (buyer + price)`,
          );
        }
      }
      // Double-close on an UNSOLD auction (reserve not met) must be idempotent: exactly one
      // AuctionClosed event, one close effect, no duplicate credit release.
      const { auctionId } = await makeAuction(sellerToken, staffToken, { reserveMinor: 900_000 });
      await openAuction(staffToken, auctionId);
      await bid(A.token, auctionId, 150_000); // below reserve -> passes in
      const [c1, c2] = await Promise.all([
        close(staffToken, auctionId),
        close(staffToken, auctionId),
      ]);
      const closedEvents = await prisma.outboxEvent.count({
        where: { aggregateId: auctionId, name: 'AUCTION_CLOSED' },
      });
      const finalAuc = await prisma.auction.findUnique({ where: { id: auctionId } });
      raceOk &=
        check(c1.status < 500 && c2.status < 500, 'R: double-close no 5xx') &
        check(finalAuc.status === 'closed', 'R: unsold auction is closed exactly once') &
        check(
          closedEvents === 1,
          `R: exactly ONE AuctionClosed event emitted (got ${closedEvents})`,
        );
      record('Close/bid race + idempotency', raceOk);
    }

    await prisma.$disconnect();

    console.log('\n=== Auction stress matrix ===');
    for (const r of matrix)
      console.log(`  ${r.result === 'PASS' ? '✓' : '✗'} ${r.scenario.padEnd(22)} ${r.result}`);

    if (failures > 0) {
      console.error(`\n✗ e2e-auction-stress: ${failures} check(s) failed`);
      process.exit(1);
    }
    console.log('\n✓ e2e-auction-stress: all scenarios passed');
  } finally {
    child.kill('SIGKILL');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
