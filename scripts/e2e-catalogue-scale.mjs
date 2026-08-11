#!/usr/bin/env node
/**
 * Catalogue scale acceptance (pack 01 doc 05). Bulk-seeds a large catalogue
 * directly via Prisma (fast — no API round-trips) and proves the AuctionFlow
 * scale guarantees against the REAL running API:
 *
 *  - Every item in a category is reachable through the per-category Rubik row
 *    cursor — not just the first global page (walk the whole chain, no repeats).
 *  - The category facet is DB-side correct at volume.
 *  - The global list never downloads all inventory (a page returns `limit` rows).
 *
 * Volume is configurable via SCALE_N (default 2000 vehicles + mixed categories).
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import PrismaPkg from '@prisma/client';

const { PrismaClient } = PrismaPkg;
const BASE = 'http://localhost:4000';
const N = Number(process.env.SCALE_N ?? 2000);
const OTHER = { machinery: 300, gems: 150, property: 120 };
let failures = 0;

function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
}

async function v2(path) {
  const res = await fetch(`${BASE}/api/v2${path}`);
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
      /* not up yet */
    }
    await sleep(500);
  }
  return false;
}

/** Bulk-insert `count` published TIMED_AUCTION listings in a category. */
async function seedCategory(prisma, category, count) {
  const batch = 500;
  for (let start = 0; start < count; start += batch) {
    const n = Math.min(batch, count - start);
    const assets = [];
    const listings = [];
    for (let k = 0; k < n; k += 1) {
      const assetId = randomUUID();
      assets.push({ id: assetId, category, attributes: {} });
      listings.push({
        id: randomUUID(),
        assetId,
        saleMethod: 'TIMED_AUCTION',
        status: 'scheduled',
        publicRef: `SCALE-${category}-${start + k}-${randomUUID().slice(0, 8)}`,
        title: `${category} lot ${start + k}`,
      });
    }
    await prisma.asset.createMany({ data: assets });
    await prisma.listing.createMany({ data: listings });
  }
}

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

    console.log(`Seeding ${N} vehicles + ${JSON.stringify(OTHER)} …`);
    const t0 = Date.now();
    await seedCategory(prisma, 'vehicles', N);
    for (const [cat, count] of Object.entries(OTHER)) await seedCategory(prisma, cat, count);
    console.log(`  seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // 1) Global list never downloads all inventory.
    const page = await v2('/catalogue?limit=24');
    check(
      page.status === 200 && page.json.items.length === 24,
      'global list returns one page (24)',
    );
    check(
      page.json.total >= N + OTHER.machinery + OTHER.gems + OTHER.property,
      `total reflects the full seeded volume (${page.json.total})`,
    );

    // 2) DB-side facet is correct at volume.
    const vehiclesFacet = (page.json.facets.category ?? []).find((f) => f.value === 'vehicles');
    check(
      vehiclesFacet?.count === N,
      `DB-side vehicles facet count = ${N} (got ${vehiclesFacet?.count})`,
    );

    // 3) Every vehicles item is reachable through the row cursor — no repeats.
    const seen = new Set();
    let cursor = null;
    let steps = 0;
    let duplicate = false;
    for (;;) {
      const q = cursor ? `&cursor=${cursor}` : '';
      const row = (await v2(`/catalogue/row?category=vehicles&limit=30${q}`)).json;
      for (const it of row.items) {
        if (seen.has(it.id)) duplicate = true;
        seen.add(it.id);
      }
      if (row.exhausted || !row.nextCursor || steps++ > N + 10) break;
      cursor = row.nextCursor;
    }
    check(!duplicate, 'row cursor walk produced no duplicate lots');
    check(
      seen.size === N,
      `every one of ${N} vehicles lots is reachable via Rubik (got ${seen.size})`,
    );

    if (failures > 0) {
      console.error(`\n${failures} scale check(s) failed.`);
      process.exit(1);
    }
    console.log('\nAll catalogue scale checks passed.');
  } finally {
    await prisma.$disconnect().catch(() => {});
    child.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
