#!/usr/bin/env node
/**
 * Durable institutional-seller attribution + migration safety (pack 01 docs 09,
 * 11). Two proofs against the real API + ephemeral Postgres:
 *
 *  A. DURABILITY — an asset (and the Sale awarded from it) keeps its seller-org
 *     attribution even after the consigning employee LEAVES the organization.
 *     Attribution is captured at consignment, never derived from live membership.
 *
 *  B. MIGRATION SAFETY — the durable_seller_org backfill, applied to
 *     representative "old" (null-attribution) rows, attributes only the
 *     unambiguous ones, leaves multi-org owners NULL, and preserves every
 *     pre-existing id and amount (expand → backfill → verify).
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import PrismaPkg from '@prisma/client';

const { PrismaClient } = PrismaPkg;
const BASE = 'http://localhost:4000';
const V1 = `${BASE}/api/v1`;
let failures = 0;

function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
}

async function call(url, { token, method = 'GET', body } = {}) {
  const res = await fetch(url, {
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
const v1 = (p, o) => call(`${V1}${p}`, o);

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
const token = (roles, customerId) =>
  v1('/dev/token', { method: 'POST', body: { roles, customerId } }).then((r) => r.json.token);

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

    // ---- Part A: durability across a membership change --------------------
    const org = await prisma.organization.create({
      data: { id: randomUUID(), legalName: 'ABC Bank', publicRef: `ORG-${Date.now()}` },
    });
    const seller = (
      await v1('/customers', {
        method: 'POST',
        body: { legalName: 'Employee M', email: `m${Date.now()}@ex.com` },
      })
    ).json.id;
    const buyer = (
      await v1('/customers', {
        method: 'POST',
        body: { legalName: 'Buyer', email: `b${Date.now()}@ex.com` },
      })
    ).json.id;
    const membership = await prisma.organizationMember.create({
      data: { id: randomUUID(), organizationId: org.id, customerId: seller, role: 'staff' },
    });

    const sellerToken = await token(['seller'], seller);
    const staffToken = await token(['auction_staff'], seller);
    const buyerToken = await token(['customer'], buyer);

    const asset = await v1('/assets', {
      token: sellerToken,
      method: 'POST',
      body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Vitz', year: 2016 } },
    });
    const assetId = asset.json.id;
    const created = await prisma.asset.findUnique({ where: { id: assetId } });
    check(created.sellerOrganizationId === org.id, 'asset captures seller org at consignment');

    // Publish + auction + bid + close → Sale awarded.
    const listing = await v1('/listings', {
      token: sellerToken,
      method: 'POST',
      body: { assetId, saleMethod: 'TIMED_AUCTION', title: 'Vitz', publicRef: `L-${Date.now()}` },
    });
    const listingId = listing.json.id;
    await v1(`/listings/${listingId}/submit`, { token: sellerToken, method: 'POST' });
    await v1(`/listings/${listingId}/review`, {
      token: staffToken,
      method: 'POST',
      body: { decision: 'approve' },
    });
    await v1(`/listings/${listingId}/publish`, { token: staffToken, method: 'POST' });
    const auction = await v1('/auctions', {
      token: staffToken,
      method: 'POST',
      body: {
        listingId,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        openingBidMinor: 1_000_000,
        incrementMinor: 25_000,
      },
    });
    const auctionId = auction.json.id;
    await v1(`/auctions/${auctionId}/open`, { token: staffToken, method: 'POST' });
    await v1(`/auctions/${auctionId}/bids`, {
      token: buyerToken,
      method: 'POST',
      body: { maxAmountMinor: 1_000_000 },
    });
    await v1(`/auctions/${auctionId}/close`, { token: staffToken, method: 'POST' });
    const saleAfter = await prisma.sale.findUnique({ where: { listingId } });
    check(saleAfter?.sellerOrganizationId === org.id, 'Sale copies durable seller org at award');

    // The employee LEAVES the organization.
    await prisma.organizationMember.delete({ where: { id: membership.id } });
    const assetPost = await prisma.asset.findUnique({ where: { id: assetId } });
    const salePost = await prisma.sale.findUnique({ where: { listingId } });
    check(
      assetPost.sellerOrganizationId === org.id,
      'asset STILL attributed to org after member leaves (durable)',
    );
    check(
      salePost.sellerOrganizationId === org.id,
      'Sale STILL attributed to org after member leaves (durable)',
    );

    // ---- Part B: migration backfill on representative "old" data ----------
    const org2 = await prisma.organization.create({
      data: { id: randomUUID(), legalName: 'XYZ Co', publicRef: `ORG2-${Date.now()}` },
    });
    const org3 = await prisma.organization.create({
      data: { id: randomUUID(), legalName: 'PQR Co', publicRef: `ORG3-${Date.now()}` },
    });
    const solo = (
      await v1('/customers', {
        method: 'POST',
        body: { legalName: 'Solo', email: `s${Date.now()}@ex.com` },
      })
    ).json.id;
    const multi = (
      await v1('/customers', {
        method: 'POST',
        body: { legalName: 'Multi', email: `mu${Date.now()}@ex.com` },
      })
    ).json.id;
    await prisma.organizationMember.create({
      data: { id: randomUUID(), organizationId: org2.id, customerId: solo, role: 'staff' },
    });
    await prisma.organizationMember.create({
      data: { id: randomUUID(), organizationId: org2.id, customerId: multi, role: 'staff' },
    });
    await prisma.organizationMember.create({
      data: { id: randomUUID(), organizationId: org3.id, customerId: multi, role: 'staff' },
    });

    // Old rows: attribution NULL (as if they predated the column).
    const soloAssetId = randomUUID();
    const multiAssetId = randomUUID();
    const oldListingId = randomUUID();
    await prisma.asset.create({
      data: {
        id: soloAssetId,
        category: 'vehicles',
        attributes: {},
        ownerCustomerId: solo,
        sellerOrganizationId: null,
      },
    });
    await prisma.asset.create({
      data: {
        id: multiAssetId,
        category: 'vehicles',
        attributes: {},
        ownerCustomerId: multi,
        sellerOrganizationId: null,
      },
    });
    await prisma.listing.create({
      data: {
        id: oldListingId,
        assetId: soloAssetId,
        saleMethod: 'TIMED_AUCTION',
        status: 'sold',
        publicRef: `OLD-${Date.now()}`,
        title: 'Old',
      },
    });
    const oldSaleId = randomUUID();
    const oldAmount = 4_250_000n;
    await prisma.sale.create({
      data: {
        id: oldSaleId,
        listingId: oldListingId,
        buyerCustomerId: buyer,
        channel: 'auction',
        amountMinor: oldAmount,
        sellerOrganizationId: null,
      },
    });

    // Apply the migration's backfill SQL (the exact statements shipped).
    const migSql = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        'database/prisma/migrations/20260811080000_durable_seller_org/migration.sql',
      ),
      'utf8',
    );
    // Strip ALL -- comment lines FIRST (a comment may contain a ';'), then split
    // into statements and run the backfill UPDATEs exactly as the migration does.
    const sqlNoComments = migSql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    for (const raw of sqlNoComments.split(';')) {
      const stmt = raw.trim();
      if (/^UPDATE/i.test(stmt)) await prisma.$executeRawUnsafe(stmt);
    }

    const soloAsset = await prisma.asset.findUnique({ where: { id: soloAssetId } });
    const multiAsset = await prisma.asset.findUnique({ where: { id: multiAssetId } });
    const oldSale = await prisma.sale.findUnique({ where: { id: oldSaleId } });
    check(
      soloAsset.sellerOrganizationId === org2.id,
      'backfill attributes an unambiguous (single-org) owner',
    );
    check(
      multiAsset.sellerOrganizationId === null,
      'backfill leaves a multi-org owner NULL (never guesses)',
    );
    check(oldSale.sellerOrganizationId === org2.id, 'backfill attributes the sale from its asset');
    // Survival: ids + amount unchanged by the migration.
    check(
      oldSale.id === oldSaleId && oldSale.amountMinor === oldAmount,
      'migration preserved the sale id and amount',
    );
    check(
      soloAsset.id === soloAssetId && multiAsset.id === multiAssetId,
      'migration preserved asset ids',
    );

    if (failures > 0) {
      console.error(`\n${failures} seller-org check(s) failed.`);
      process.exit(1);
    }
    console.log('\nAll seller-org + migration-safety checks passed.');
  } finally {
    await prisma.$disconnect().catch(() => {});
    child.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
