#!/usr/bin/env node
/**
 * Evolution E12 Intelligence expansion E2E (pack doc 12 §AI). Boots the built API with
 * FEATURE_INSIGHT_ENGINE (+ supply programmes as a data source) ON and proves the DETERMINISTIC,
 * derived, NON-BINDING intelligence surface:
 *  - buyer↔supply matching ranks offerable programmes best-fit/cheapest first (excludes non-matches);
 *  - pricing comparables compute exact min/median/max over observed programme prices;
 *  - offer comparison ranks complete proposals (cheapest/fastest) and never selects a winner;
 *  - fraud/risk scoring bands a review signal (operator-only; a buyer is denied);
 *  - every response carries binding:false and is persisted as a derived IntelligenceReport.
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
    env: { ...process.env, FEATURE_INSIGHT_ENGINE: 'true', FEATURE_SUPPLY_PROGRAMMES: 'true' },
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

    const supplier = await token(['customer'], await registerCustomer('insSup'));
    const buyer = await token(['customer'], await registerCustomer('insBuyer'));
    const operator = await token(['auction_staff'], await registerCustomer('insOp'));

    // ---- seed offerable supply programmes (the matching/pricing data source) ----
    const mkProgramme = async (over) => {
      const created = await post('/supply/programmes', {
        token: supplier,
        body: {
          product: 'Red Onion',
          category: 'produce',
          originCountry: 'IN',
          quantityUnitCode: 'MT',
          availableQuantity: '100',
          minOrderQuantity: '10',
          currency: 'USD',
          ...over,
        },
      });
      const id = created.json.id;
      await post(`/supply/programmes/${id}/status`, {
        token: supplier,
        body: { status: 'active' },
      });
      return id;
    };
    const cheap = await mkProgramme({ indicativePriceMinor: 30000 });
    const dear = await mkProgramme({ indicativePriceMinor: 90000 });
    await mkProgramme({ category: 'metals', product: 'Steel', indicativePriceMinor: 5000 }); // off-category

    // ---- matching: best-fit/cheapest first, excludes the off-category programme ----
    const match = await post('/insight/match', {
      token: buyer,
      body: { category: 'produce', product: 'onion', quantityRequired: '20', originCountry: 'IN' },
    });
    check(
      match.status === 201 && match.json?.binding === false,
      'match is advisory (binding:false)',
    );
    check(
      match.json?.count === 2,
      `match excludes the off-category programme (count ${match.json?.count})`,
    );
    check(
      match.json?.matches?.[0]?.programmeId === cheap &&
        match.json?.matches?.[1]?.programmeId === dear,
      'matches rank same-fit cheapest first',
    );
    check(
      Array.isArray(match.json?.matches?.[0]?.factors) &&
        match.json.matches[0].factors.includes('category:exact'),
      'match is explainable (factors)',
    );

    // ---- pricing comparables: exact stats over produce prices ----
    const pricing = await post('/insight/pricing/comparables', {
      token: buyer,
      body: { category: 'produce' },
    });
    check(
      pricing.json?.count === 2 &&
        pricing.json?.minMinor === 30000 &&
        pricing.json?.medianMinor === 60000 &&
        pricing.json?.maxMinor === 90000 &&
        pricing.json?.spreadMinor === 60000,
      'pricing comparables are exact (min 30000 / median 60000 / max 90000)',
    );

    // ---- offer comparison: advisory ranking, never a selection ----
    const cmp = await post('/insight/offers/compare', {
      token: buyer,
      body: {
        proposals: [
          { id: 'a', totalPriceMinor: 900, deliveryDays: 5 },
          { id: 'b', totalPriceMinor: 300, deliveryDays: 10 },
          { id: 'c', totalPriceMinor: 600, deliveryDays: 1 },
        ],
      },
    });
    check(
      cmp.json?.binding === false &&
        cmp.json?.ranked?.map((r) => r.id).join(',') === 'b,c,a' &&
        cmp.json?.cheapestId === 'b' &&
        cmp.json?.fastestId === 'c',
      'offer comparison ranks cheapest-first and flags cheapest/fastest (no selection)',
    );

    // ---- fraud/risk: operator-only review signal ----
    const buyerRisk = await post('/insight/risk', { token: buyer, body: { accountAgeDays: 1 } });
    check(
      buyerRisk.status === 403,
      `risk is operator-only — buyer denied (got ${buyerRisk.status})`,
    );
    const risk = await post('/insight/risk', {
      token: operator,
      body: { accountAgeDays: 1, unverifiedHighValue: true, chargebackHistory: true },
    });
    check(
      risk.json?.band === 'high' && risk.json?.flags?.includes('unverified_high_value'),
      'risk scoring bands the review signal (high)',
    );

    // anonymous cannot use intelligence
    const anon = await post('/insight/match', { body: { category: 'produce' } });
    check(
      anon.status === 403 || anon.status === 401,
      `anonymous match denied (got ${anon.status})`,
    );

    // ---- DB: derived, non-binding reports persisted ----
    const reports = await prisma.intelligenceReport.findMany();
    check(reports.length >= 4, `intelligence reports persisted (${reports.length})`);
    check(
      reports.every((r) => r.result && r.result.binding === false),
      'every persisted report is non-binding',
    );
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} intelligence E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll intelligence E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
