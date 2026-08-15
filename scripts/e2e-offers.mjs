#!/usr/bin/env node
/**
 * Evolution E4 Commercial Offer Engine V2 E2E (pack doc 08). Boots the built API with
 * FEATURE_COMMERCIAL_OFFERS_V2 + FEATURE_SEALED_OFFERS ON and proves the money-critical
 * guarantees end-to-end against real Postgres:
 *
 *  - Open negotiation: submit → counter appends an immutable revision (prior terms kept) →
 *    accept binds ONE Sale at the terms on the table; unit-priced offers bind unitPrice×qty
 *    as an exact integer of minor units.
 *  - Atomicity: a concurrent burst of accepts on one offer yields exactly one Sale.
 *  - Sealed confidentiality (pack doc 20): before the reveal only COUNTS are visible — no
 *    amounts leak to buyers or to the operator roster; an award before reveal is refused.
 *  - DECISIONS D4: MANUAL_SELECTION (the default) never auto-awards the highest — an award
 *    with no explicit selection is refused (400); the authorised seller may bind ANY revealed
 *    offer, even the lowest. AUTO_HIGHEST binds the highest ONLY when explicitly configured.
 *  - Authorization is server-side throughout (buyers cannot counter/reveal/award).
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
      publicRef: `OF-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
    },
  });
  return listing.json.id;
}

const LKR = 'LKR';

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FEATURE_COMMERCIAL_OFFERS_V2: 'true',
      FEATURE_SEALED_OFFERS: 'true',
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

    const sellerId = await registerCustomer('ofSeller');
    const buyerA = await registerCustomer('ofA');
    const buyerB = await registerCustomer('ofB');
    const buyerC = await registerCustomer('ofC');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff']);
    const tokenA = await token(['customer'], buyerA);
    const tokenB = await token(['customer'], buyerB);
    const tokenC = await token(['customer'], buyerC);

    // ---- Flag gate: off by default. A second app instance with the flag OFF 404s. Skipped
    // here (single boot); the service unit spec covers the gate. ----

    // ==== Part 1 — open negotiation: submit → counter (append revision) → accept ====
    const l1 = await makeListing(sellerToken, 'MAKE_OFFER');
    const submit = await post('/commercial-offers', {
      token: tokenA,
      body: {
        listingId: l1,
        saleMethodCode: 'MAKE_OFFER',
        proposal: { currency: LKR, totalPriceMinor: 1_000_000, notes: 'opening' },
      },
    });
    check(
      submit.status === 201 && submit.json?.status === 'open' && submit.json?.sealed === false,
      'buyer submitted an open offer (revision 1)',
    );
    const offerId = submit.json.id;

    // A buyer cannot counter (operate-only) → 403.
    const buyerCounter = await post(`/commercial-offers/${offerId}/counter`, {
      token: tokenA,
      body: { proposal: { currency: LKR, totalPriceMinor: 1_200_000 } },
    });
    check(buyerCounter.status === 403, `buyer cannot counter -> 403 (got ${buyerCounter.status})`);

    const counter = await post(`/commercial-offers/${offerId}/counter`, {
      token: staffToken,
      body: {
        proposal: { currency: LKR, totalPriceMinor: 1_400_000, paymentTerms: 'Net 30' },
      },
    });
    check(
      counter.status === 201 && counter.json?.status === 'countered',
      'operator countered (revision 2 appended)',
    );

    const accept = await post(`/commercial-offers/${offerId}/accept`, { token: staffToken });
    check(
      accept.status === 201 && accept.json?.sold === true && accept.json?.amountMinor === 1_400_000,
      'operator accepted → Sale bound at the countered terms (1,400,000)',
    );

    // ==== Part 1b — unit-priced offer binds unitPrice × quantity as an exact integer ====
    const l1b = await makeListing(sellerToken, 'MAKE_OFFER');
    const unitOffer = await post('/commercial-offers', {
      token: tokenA,
      body: {
        listingId: l1b,
        saleMethodCode: 'MAKE_OFFER',
        proposal: {
          currency: LKR,
          unitPriceMinor: 25_000,
          quantity: '100',
          quantityUnitCode: 'kg',
        },
      },
    });
    check(unitOffer.status === 201, 'buyer submitted a unit-priced offer (25,000/kg × 100)');
    const unitAccept = await post(`/commercial-offers/${unitOffer.json.id}/accept`, {
      token: staffToken,
    });
    check(
      unitAccept.status === 201 && unitAccept.json?.amountMinor === 2_500_000,
      `unit-priced Sale bound at exact 2,500,000 (got ${unitAccept.json?.amountMinor})`,
    );

    // ==== Part 2 — atomic accept: a concurrent burst yields exactly one Sale ====
    const l2 = await makeListing(sellerToken, 'MAKE_OFFER');
    const raceOffer = await post('/commercial-offers', {
      token: tokenB,
      body: {
        listingId: l2,
        saleMethodCode: 'MAKE_OFFER',
        proposal: { currency: LKR, totalPriceMinor: 900_000 },
      },
    });
    const raceOfferId = raceOffer.json.id;
    const burst = await Promise.all(
      Array.from({ length: 6 }, () =>
        post(`/commercial-offers/${raceOfferId}/accept`, { token: staffToken }),
      ),
    );
    const accepted = burst.filter((r) => r.status === 201).length;
    const conflicted = burst.filter((r) => r.status === 409).length;
    check(accepted === 1, `concurrent accept: exactly 1 Sale (got ${accepted})`);
    check(conflicted === 5, `concurrent accept: 5 rejected as conflict (got ${conflicted})`);

    // ==== Part 3 — sealed offers: confidential → reveal → D4 manual award ====
    const l3 = await makeListing(sellerToken, 'SEALED_TENDER');
    const sealedSubmit = (t, amount) =>
      post('/commercial-offers', {
        token: t,
        body: {
          listingId: l3,
          saleMethodCode: 'SEALED_TENDER',
          sealed: true,
          proposal: { currency: LKR, totalPriceMinor: amount },
        },
      });
    const sA = await sealedSubmit(tokenA, 3_000_000); // lowest
    const sB = await sealedSubmit(tokenB, 5_000_000); // highest
    const sC = await sealedSubmit(tokenC, 4_000_000);
    check(
      sA.status === 201 && sA.json?.sealed === true && sA.json?.amountMinor === undefined,
      'sealed submission returns a receipt — no amount echoed',
    );
    check(sB.status === 201 && sC.status === 201, 'sealed offers B + C submitted');

    // Duplicate sealed submission by the same buyer → 409.
    const dupe = await sealedSubmit(tokenA, 9_000_000);
    check(dupe.status === 409, `duplicate sealed offer -> 409 (got ${dupe.status})`);

    // Buyer participation view — counts only, NO amounts/identities (pack doc 20). Assert the
    // response carries EXACTLY the count keys, so no price or bidder field can leak.
    const participation = await get(`/commercial-offers/listings/${l3}/participation`, {
      token: tokenA,
    });
    check(
      participation.json?.participants === 3 &&
        participation.json?.offersReceived === 3 &&
        Object.keys(participation.json ?? {})
          .sort()
          .join(',') === 'listingId,offersReceived,participants',
      'participation view is counts-only (3 participants / 3 offers, no amounts/identities)',
    );

    // Operator roster before reveal — sealed, counts only, no ranked amounts.
    const rosterPre = await get(`/commercial-offers/listings/${l3}`, { token: staffToken });
    check(
      rosterPre.json?.sealed === true &&
        rosterPre.json?.revealed === false &&
        !rosterPre.json?.offers,
      'operator roster before reveal shows no ranked offers',
    );

    // Award BEFORE reveal is refused (D4: no winner before reveal).
    const earlyAward = await post(`/commercial-offers/listings/${l3}/award`, {
      token: staffToken,
      body: { policy: 'MANUAL_SELECTION', selectedOfferId: sB.json.id },
    });
    check(earlyAward.status === 409, `award before reveal -> 409 (got ${earlyAward.status})`);

    // A buyer cannot reveal.
    const buyerReveal = await post(`/commercial-offers/listings/${l3}/reveal`, { token: tokenA });
    check(buyerReveal.status === 403, `buyer cannot reveal -> 403 (got ${buyerReveal.status})`);

    // Operator reveals → ranked highest-first (B 5M, C 4M, A 3M).
    const reveal = await post(`/commercial-offers/listings/${l3}/reveal`, { token: staffToken });
    const rankedIds = (reveal.json?.offers ?? []).map((o) => o.offerId);
    check(
      reveal.status === 201 &&
        reveal.json?.revealed === true &&
        rankedIds.join(',') === [sB.json.id, sC.json.id, sA.json.id].join(','),
      'reveal ranks offers highest-first (B, C, A)',
    );

    // D4: MANUAL_SELECTION with NO explicit selection is refused (never auto-awards highest).
    const noPick = await post(`/commercial-offers/listings/${l3}/award`, {
      token: staffToken,
      body: { policy: 'MANUAL_SELECTION' },
    });
    check(
      noPick.status === 400,
      `MANUAL_SELECTION without a selection -> 400 — the highest never auto-awards (got ${noPick.status})`,
    );

    // D4: the seller binds an explicit choice — here the LOWEST (A), proving price is not forced.
    const award = await post(`/commercial-offers/listings/${l3}/award`, {
      token: staffToken,
      body: { policy: 'MANUAL_SELECTION', selectedOfferId: sA.json.id },
    });
    check(
      award.status === 201 && award.json?.sold === true && award.json?.amountMinor === 3_000_000,
      'operator explicitly awards the LOWEST offer (A, 3,000,000) on full terms',
    );

    // Re-award is refused (already sold).
    const reAward = await post(`/commercial-offers/listings/${l3}/award`, {
      token: staffToken,
      body: { policy: 'MANUAL_SELECTION', selectedOfferId: sB.json.id },
    });
    check(reAward.status === 409, `re-award after sale -> 409 (got ${reAward.status})`);

    // ==== Part 4 — AUTO_HIGHEST binds the highest ONLY when explicitly configured ====
    const l4 = await makeListing(sellerToken, 'SEALED_TENDER');
    const hSubmit = (t, amount) =>
      post('/commercial-offers', {
        token: t,
        body: {
          listingId: l4,
          saleMethodCode: 'SEALED_TENDER',
          sealed: true,
          proposal: { currency: LKR, totalPriceMinor: amount },
        },
      });
    await hSubmit(tokenA, 2_000_000);
    await hSubmit(tokenB, 6_000_000);
    await post(`/commercial-offers/listings/${l4}/reveal`, { token: staffToken });
    const autoAward = await post(`/commercial-offers/listings/${l4}/award`, {
      token: staffToken,
      body: { policy: 'AUTO_HIGHEST' },
    });
    check(
      autoAward.status === 201 && autoAward.json?.amountMinor === 6_000_000,
      'AUTO_HIGHEST (explicitly configured) binds the highest offer (6,000,000)',
    );

    // ==== DB assertions: revisions append-only, sales, losers rejected, outbox ====
    const prisma = new PrismaClient();
    try {
      const revs = await prisma.offerRevision.findMany({
        where: { offerId },
        orderBy: { revisionNumber: 'asc' },
      });
      check(
        revs.length === 2 &&
          revs[0].revisionNumber === 1 &&
          revs[1].revisionNumber === 2 &&
          Number(revs[0].totalPriceMinor) === 1_000_000 &&
          Number(revs[1].totalPriceMinor) === 1_400_000,
        'offer revisions are append-only (r1 1,000,000 kept; r2 1,400,000 added)',
      );

      const s1 = await prisma.sale.findUnique({ where: { listingId: l1 } });
      check(
        s1?.channel === 'make_offer' && Number(s1.amountMinor) === 1_400_000,
        'open-offer Sale recorded at accepted amount',
      );

      const raceSales = await prisma.sale.count({ where: { listingId: l2 } });
      check(raceSales === 1, `concurrent accept produced exactly one Sale row (got ${raceSales})`);

      const s3 = await prisma.sale.findUnique({ where: { listingId: l3 } });
      check(
        s3?.channel === 'sealed_tender' && s3.buyerCustomerId === buyerA,
        'sealed Sale awarded to the explicitly-chosen (lowest) buyer A — NOT the highest (D4)',
      );
      const winner = await prisma.offer.findUnique({ where: { id: sA.json.id } });
      const loserB = await prisma.offer.findUnique({ where: { id: sB.json.id } });
      check(
        winner?.status === 'accepted' &&
          winner?.awardPolicy === 'MANUAL_SELECTION' &&
          winner?.revealedAt != null,
        'winning offer marked accepted + MANUAL_SELECTION + revealed',
      );
      check(loserB?.status === 'rejected', 'losing sealed offer B marked rejected');

      const events = (await prisma.outboxEvent.findMany({ where: { aggregateId: l3 } })).map(
        (e) => e.name,
      );
      check(events.includes('SALE_CONFIRMED'), 'sealed award emitted SALE_CONFIRMED to the outbox');
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} offers E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll offers E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
