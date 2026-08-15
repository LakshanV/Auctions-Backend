#!/usr/bin/env node
/**
 * Evolution E10 Supply Programmes + perishable-goods E2E (pack doc 09 §Supply Programme + owner reqs
 * 23/24). Boots the built API with FEATURE_SUPPLY_PROGRAMMES + FEATURE_PERISHABLE_GOODS ON and proves
 * the recurring-availability side of the two-sided market:
 *  - a supplier posts standing availability; min>max is refused (422);
 *  - lifecycle is transition-guarded (withdrawn → active is 409); only the owner manages it (403);
 *  - buyer matching ranks offerable programmes cheapest-first as a RECOMMENDATION only — it awards
 *    nothing and excludes non-offerable / out-of-range programmes (§09 / D4);
 *  - perishable metadata attaches to an owned programme, validates date/temperature ordering (422),
 *    and drives automatic expiry (future best-use → not expired; past → expired).
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
    env: { ...process.env, FEATURE_SUPPLY_PROGRAMMES: 'true', FEATURE_PERISHABLE_GOODS: 'true' },
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

    const supplier = await token(['customer'], await registerCustomer('supA'));
    const supplier2 = await token(['customer'], await registerCustomer('supB'));
    const buyer = await token(['customer'], await registerCustomer('supBuyer'));
    const stranger = await token(['customer'], await registerCustomer('supX'));

    const onion = (over) => ({
      product: 'Red Onion',
      category: 'produce',
      originCountry: 'IN',
      quantityUnitCode: 'MT',
      availableQuantity: '100',
      minOrderQuantity: '10',
      maxOrderQuantity: '100',
      currency: 'USD',
      leadTimeDays: 7,
      ...over,
    });

    // ---- a supplier posts standing availability (draft) ----
    const cheap = await post('/supply/programmes', {
      token: supplier,
      body: onion({ indicativePriceMinor: 30000 }),
    });
    check(
      cheap.status === 201 && cheap.json?.status === 'draft',
      'supplier posts a programme (draft)',
    );
    const cheapId = cheap.json.id;

    const dear = await post('/supply/programmes', {
      token: supplier2,
      body: onion({ indicativePriceMinor: 90000 }),
    });
    const dearId = dear.json.id;
    // needs a bigger minimum order than the buyer wants → must be excluded from recommendations
    const bigMin = await post('/supply/programmes', {
      token: supplier2,
      body: onion({ indicativePriceMinor: 1, minOrderQuantity: '50' }),
    });
    const bigMinId = bigMin.json.id;
    // a programme left in draft → not offerable → must be excluded
    const draft = await post('/supply/programmes', {
      token: supplier,
      body: onion({ indicativePriceMinor: 1 }),
    });

    // ---- min > max is refused ----
    const badRange = await post('/supply/programmes', {
      token: supplier,
      body: onion({ minOrderQuantity: '100', maxOrderQuantity: '10' }),
    });
    check(badRange.status === 422, `min > max order quantity -> 422 (got ${badRange.status})`);

    // ---- activate the three that should be live ----
    const activate = (t, id) =>
      post(`/supply/programmes/${id}/status`, { token: t, body: { status: 'active' } });
    const a1 = await activate(supplier, cheapId);
    const a2 = await activate(supplier2, dearId);
    const a3 = await activate(supplier2, bigMinId);
    check(
      a1.json?.status === 'active' && a2.json?.status === 'active' && a3.json?.status === 'active',
      'programmes activate (draft → active)',
    );

    // ---- lifecycle is transition-guarded: withdrawn → active is illegal ----
    await post(`/supply/programmes/${cheapId}/status`, {
      token: supplier,
      body: { status: 'withdrawn' },
    });
    const revive = await activate(supplier, cheapId);
    check(revive.status === 409, `withdrawn → active is refused -> 409 (got ${revive.status})`);
    // put it back to active for the rest of the test (withdrawn is terminal, so re-create the live one)
    const cheap2 = await post('/supply/programmes', {
      token: supplier,
      body: onion({ indicativePriceMinor: 30000 }),
    });
    const liveCheapId = cheap2.json.id;
    await activate(supplier, liveCheapId);

    // ---- only the owner manages a programme ----
    const strangerSet = await post(`/supply/programmes/${dearId}/status`, {
      token: stranger,
      body: { status: 'paused' },
    });
    check(
      strangerSet.status === 403,
      `non-owner cannot manage a programme -> 403 (got ${strangerSet.status})`,
    );

    // ---- buyer matching: cheapest-first RECOMMENDATION only, excludes non-offerable/out-of-range ----
    const recs = await post('/supply/recommend', {
      token: buyer,
      body: { category: 'produce', product: 'onion', quantityRequired: '20', originCountry: 'IN' },
    });
    const ids = recs.json?.recommendations?.map((r) => r.programmeId) ?? [];
    check(
      recs.status === 201 && recs.json?.binding === false,
      `recommendation is advisory (binding:false, got ${recs.status})`,
    );
    check(
      ids.includes(liveCheapId) && ids.includes(dearId) && !ids.includes(bigMinId),
      'matching includes offerable in-range programmes and excludes the over-minimum one',
    );
    check(
      ids.indexOf(liveCheapId) < ids.indexOf(dearId),
      'matches rank cheapest indicative price first (recommendation only)',
    );

    // anonymous cannot query supply
    const anon = await post('/supply/recommend', { body: { product: 'onion' } });
    check(
      anon.status === 403 || anon.status === 401,
      `anonymous recommend denied (got ${anon.status})`,
    );

    // ---- perishable metadata: attach to an owned programme, future best-use → not expired ----
    const attachFuture = await post('/supply/perishable', {
      token: supplier,
      body: {
        subjectType: 'supply_programme',
        subjectId: liveCheapId,
        metadata: {
          harvestDate: '2026-06-01T00:00:00.000Z',
          packingDate: '2026-06-02T00:00:00.000Z',
          expiryDate: '2027-01-01T00:00:00.000Z',
          variety: 'Bellary',
          grade: 'A',
          moisturePercent: '12.5',
          tempMinC: '-2',
          tempMaxC: '4',
          coldChain: true,
        },
      },
    });
    check(attachFuture.status === 201, `attach perishable metadata (got ${attachFuture.status})`);
    const viewFuture = await get(`/supply/perishable/supply_programme/${liveCheapId}`, {
      token: supplier,
    });
    check(
      viewFuture.json?.expired === false && viewFuture.json?.coldChain === true,
      'future best-use date → not expired; cold-chain echoed',
    );

    // ---- upsert to a PAST best-use date → automatic expiry ----
    const attachPast = await post('/supply/perishable', {
      token: supplier,
      body: {
        subjectType: 'supply_programme',
        subjectId: liveCheapId,
        metadata: { expiryDate: '2020-01-01T00:00:00.000Z', grade: 'A' },
      },
    });
    check(attachPast.status === 201, 'upsert perishable metadata (past best-use)');
    const viewPast = await get(`/supply/perishable/supply_programme/${liveCheapId}`, {
      token: supplier,
    });
    check(viewPast.json?.expired === true, 'past best-use date → automatically expired');

    // ---- invalid metadata (harvest after packing) → 422 ----
    const badDates = await post('/supply/perishable', {
      token: supplier,
      body: {
        subjectType: 'supply_programme',
        subjectId: liveCheapId,
        metadata: {
          harvestDate: '2026-06-05T00:00:00.000Z',
          packingDate: '2026-06-02T00:00:00.000Z',
        },
      },
    });
    check(badDates.status === 422, `harvest after packing -> 422 (got ${badDates.status})`);

    // ---- non-owner cannot attach to someone else's programme ----
    const strangerAttach = await post('/supply/perishable', {
      token: stranger,
      body: { subjectType: 'supply_programme', subjectId: liveCheapId, metadata: { grade: 'B' } },
    });
    check(
      strangerAttach.status === 403,
      `non-owner perishable attach -> 403 (got ${strangerAttach.status})`,
    );

    // ---- unknown subject → 404 ----
    const missing = await post('/supply/perishable', {
      token: supplier,
      body: { subjectType: 'supply_programme', subjectId: 'sp_does_not_exist', metadata: {} },
    });
    check(missing.status === 404, `attach to unknown programme -> 404 (got ${missing.status})`);

    // ---- DB assertions ----
    const liveRow = await prisma.supplyProgramme.findUnique({ where: { id: liveCheapId } });
    check(liveRow?.status === 'active', 'live programme persisted active');
    const withdrawnRow = await prisma.supplyProgramme.findUnique({ where: { id: cheapId } });
    check(
      withdrawnRow?.status === 'withdrawn',
      'withdrawn programme persisted withdrawn (terminal)',
    );
    const meta = await prisma.perishableMetadata.findUnique({
      where: { subjectType_subjectId: { subjectType: 'supply_programme', subjectId: liveCheapId } },
    });
    check(
      meta != null && meta.expiryDate?.toISOString() === '2020-01-01T00:00:00.000Z',
      'perishable metadata upserted (single row, latest best-use date)',
    );
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} supply E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll supply / perishable E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
