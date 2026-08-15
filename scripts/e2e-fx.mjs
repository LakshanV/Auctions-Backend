#!/usr/bin/env node
/**
 * Evolution E5 Currency / FX E2E (pack docs 09/10; DECISIONS D5 + D12). Boots the built API with
 * FEATURE_MULTI_CURRENCY + FEATURE_FX_DISPLAY ON (the FX provider defaults to the credential-free
 * fake) and proves:
 *  - supported-currency listing;
 *  - informational display conversion is exact and float-free ($100 → 30,000 LKR; round-trips);
 *  - every conversion is `binding: false` — display never becomes the transaction currency (D5);
 *  - a same-currency conversion is identity at rate 1;
 *  - unsupported currencies are rejected;
 *  - rate snapshots persist to fx_rate_snapshot and a fresh one is REUSED (cache, not re-quoted).
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

async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: { 'content-type': 'application/json' } });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

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

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FEATURE_MULTI_CURRENCY: 'true',
      FEATURE_FX_DISPLAY: 'true',
      FX_API_URL: '', // empty → deterministic fake provider (D12)
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

    // ---- supported currencies ----
    const currencies = await get('/fx/currencies');
    const codes = (currencies.json?.currencies ?? []).map((c) => c.code);
    check(
      currencies.status === 200 && codes.includes('LKR') && codes.includes('USD'),
      'GET /fx/currencies lists supported currencies (LKR, USD, …)',
    );

    // ---- informational display rate ----
    const rate = await get('/fx/rate?base=USD&quote=LKR');
    check(
      rate.status === 200 &&
        rate.json?.rate === '300' &&
        rate.json?.provider === 'fake' &&
        rate.json?.binding === false,
      'GET /fx/rate USD→LKR returns rate 300 (fake), binding:false',
    );

    // ---- exact, float-free conversion ----
    const conv = await get('/fx/convert?amountMinor=10000&base=USD&quote=LKR');
    check(
      conv.status === 200 &&
        conv.json?.convertedMinor === 3_000_000 &&
        conv.json?.binding === false,
      '$100.00 → 30,000.00 LKR exactly (binding:false)',
    );

    const back = await get('/fx/convert?amountMinor=3000000&base=LKR&quote=USD');
    check(
      back.status === 200 && back.json?.convertedMinor === 10_000,
      'LKR → USD round-trips to $100.00 (half-up rounding)',
    );

    const same = await get('/fx/convert?amountMinor=4242&base=LKR&quote=LKR');
    check(
      same.status === 200 && same.json?.convertedMinor === 4_242 && same.json?.rate?.rate === '1',
      'same-currency conversion is identity at rate 1',
    );

    // ---- validation ----
    const bad = await get('/fx/rate?base=USD&quote=XYZ');
    check(bad.status === 400, `unsupported currency -> 400 (got ${bad.status})`);

    // ---- snapshot persistence + cache reuse ----
    const prisma = new PrismaClient();
    try {
      const rows = await prisma.fxRateSnapshot.findMany({
        where: { base: 'USD', quote: 'LKR', provider: 'fake' },
      });
      check(
        rows.length === 1,
        `USD→LKR quoted once and reused from the snapshot cache (rows=${rows.length})`,
      );
      check(
        rows[0]?.rate === '300' && rows[0]?.expiresAt > rows[0]?.quotedAt,
        'persisted snapshot carries the exact rate + a freshness window',
      );
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} FX E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll FX E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
