#!/usr/bin/env node
/**
 * Evolution E8 Fees / Tax rules-engine E2E (pack doc 10). Boots the built API with
 * FEATURE_FEES_ENGINE ON, seeds versioned FeeRule config directly (owner config), and proves the
 * deterministic engine end-to-end:
 *  - a full breakdown (buyer premium + fixed platform fee + tax on the buyer subtotal + seller
 *    commission), exact integer minor units;
 *  - each line snapshots the applied rule code + version (reproducible after rules change);
 *  - an unverified tax rule → non-binding preview (MANUAL_REVIEW_REQUIRED, O3 / D7);
 *  - the MOST SPECIFIC rule per component wins (no double-charge);
 *  - authorization is server-side (a buyer cannot compute);
 *  - the breakdown persists to fee_breakdown.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

const feeDefaults = {
  version: 1,
  priority: 0,
  active: true,
  rateBps: null,
  fixedMinor: null,
  appliesTo: 'PRINCIPAL',
  operatorCode: null,
  jurisdiction: null,
  category: null,
  saleMethodCode: null,
  minPrincipalMinor: null,
  maxPrincipalMinor: null,
  verification: 'verified',
};

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEATURE_FEES_ENGINE: 'true' },
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

    const rule = (over) =>
      prisma.feeRule.create({ data: { id: randomUUID(), ...feeDefaults, ...over } });

    // Scenario A — full breakdown (scoped to category E8A).
    await rule({
      code: 'PREM_A',
      component: 'buyer_premium',
      side: 'BUYER',
      basis: 'PERCENT',
      rateBps: 1000,
      category: 'E8A',
    });
    await rule({
      code: 'PLAT_A',
      component: 'platform_fee',
      side: 'BUYER',
      basis: 'FIXED',
      fixedMinor: 5000n,
      category: 'E8A',
    });
    await rule({
      code: 'TAX_A',
      component: 'tax',
      side: 'BUYER',
      basis: 'PERCENT',
      rateBps: 1500,
      appliesTo: 'BUYER_SUBTOTAL',
      category: 'E8A',
    });
    await rule({
      code: 'COMM_A',
      component: 'seller_commission',
      side: 'SELLER',
      basis: 'PERCENT',
      rateBps: 800,
      category: 'E8A',
    });
    // Scenario B — unverified tax.
    await rule({
      code: 'TAX_B',
      component: 'tax',
      side: 'BUYER',
      basis: 'PERCENT',
      rateBps: 1500,
      category: 'E8B',
      verification: 'draft',
    });
    // Scenario C — most-specific wins.
    await rule({
      code: 'PREM_C_GEN',
      component: 'buyer_premium',
      side: 'BUYER',
      basis: 'PERCENT',
      rateBps: 1000,
      category: 'E8C',
    });
    await rule({
      code: 'PREM_C_LK',
      component: 'buyer_premium',
      side: 'BUYER',
      basis: 'PERCENT',
      rateBps: 1200,
      category: 'E8C',
      jurisdiction: 'LK',
    });

    const staff = await token(['auction_staff']);
    const buyer = await token(['customer']);

    // ---- full breakdown ----
    const full = await post('/fees/compute', {
      token: staff,
      body: { principalMinor: 100_000, currency: 'LKR', category: 'E8A' },
    });
    check(
      full.status === 201 &&
        full.json?.buyerFeesMinor === 15_000 && // 10% (10,000) + fixed 5,000
        full.json?.taxMinor === 17_250 && // 15% of 115,000
        full.json?.buyerTotalMinor === 132_250 &&
        full.json?.sellerCommissionMinor === 8_000 &&
        full.json?.sellerProceedsMinor === 92_000 &&
        full.json?.status === 'RESOLVED',
      'full breakdown: premium + fixed fee + tax-on-subtotal + seller commission (exact)',
    );
    const premLine = (full.json?.lines ?? []).find((l) => l.component === 'buyer_premium');
    check(
      premLine?.appliedRuleCode === 'PREM_A' && premLine?.appliedRuleVersion === 1,
      'each line snapshots the applied rule code + version (reproducible)',
    );
    check(typeof full.json?.breakdownId === 'string', 'breakdown persisted (has an id)');

    // ---- unverified tax → preview ----
    const preview = await post('/fees/compute', {
      token: staff,
      body: { principalMinor: 100_000, currency: 'LKR', category: 'E8B' },
    });
    check(
      preview.json?.status === 'MANUAL_REVIEW_REQUIRED' && preview.json?.taxMinor === 15_000,
      'an unverified tax rule → non-binding preview (O3 / D7)',
    );

    // ---- most-specific wins ----
    const specific = await post('/fees/compute', {
      token: staff,
      body: { principalMinor: 100_000, currency: 'LKR', category: 'E8C', jurisdiction: 'LK' },
    });
    check(
      specific.json?.buyerFeesMinor === 12_000 &&
        (specific.json?.lines ?? []).filter((l) => l.component === 'buyer_premium').length === 1,
      'most-specific rule per component wins (12% LK, not 10% + 12%)',
    );

    // ---- no match → zeros ----
    const none = await post('/fees/compute', {
      token: staff,
      body: { principalMinor: 100_000, currency: 'LKR', category: 'E8NONE' },
    });
    check(
      none.json?.buyerTotalMinor === 100_000 && none.json?.status === 'RESOLVED',
      'no matching rule → zero charges',
    );

    // ---- authorization ----
    const forbidden = await post('/fees/compute', {
      token: buyer,
      body: { principalMinor: 100_000, currency: 'LKR' },
    });
    check(
      forbidden.status === 403,
      `a buyer cannot compute charges -> 403 (got ${forbidden.status})`,
    );

    // ---- persistence ----
    const count = await prisma.feeBreakdown.count();
    check(count >= 4, `fee breakdowns persisted (count=${count})`);
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} fees E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll fees E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
