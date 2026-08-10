#!/usr/bin/env node
/**
 * Phase 1 data-core E2E (docs/17 gate: permissions). Boots the built API against
 * the DATABASE_URL in the environment (provide via with-ephemeral-db.mjs after
 * `pnpm db:migrate:deploy`), drives the seller → staff listing flow, asserts
 * permission enforcement (403s) and legal transitions (409), then verifies the
 * transactional outbox + append-only audit were written. Exits non-zero on any
 * failed check.
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
const ok2xx = (s) => s === 200 || s === 201;

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return false;
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

    // Public self-registration → a seller customer.
    const reg = await post('/customers', {
      body: { legalName: 'Seller One', email: `seller${Date.now()}@example.com` },
    });
    check(reg.status === 201, `register customer -> 201 (got ${reg.status})`);
    const sellerId = reg.json?.id;

    const sellerToken = (
      await post('/dev/token', { body: { roles: ['seller'], customerId: sellerId } })
    ).json?.token;
    const staffToken = (await post('/dev/token', { body: { roles: ['auction_staff'] } })).json
      ?.token;
    check(Boolean(sellerToken && staffToken), 'minted seller + staff tokens');

    // Permission enforcement: anonymous cannot create assets.
    const anon = await post('/assets', {
      body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Prado', year: 2019 } },
    });
    check(anon.status === 403, `anonymous createAsset -> 403 (got ${anon.status})`);

    // Category-schema validation: missing required field → 400.
    const bad = await post('/assets', {
      token: sellerToken,
      body: { category: 'vehicles', attributes: { make: 'Toyota' } },
    });
    check(bad.status === 400, `seller createAsset invalid attrs -> 400 (got ${bad.status})`);

    const asset = await post('/assets', {
      token: sellerToken,
      body: {
        category: 'vehicles',
        attributes: { make: 'Toyota', model: 'Prado', year: 2019, fuel: 'diesel' },
      },
    });
    check(asset.status === 201, `seller createAsset -> 201 (got ${asset.status})`);
    const assetId = asset.json?.id;

    const listing = await post('/listings', {
      token: sellerToken,
      body: {
        assetId,
        saleMethod: 'TIMED_AUCTION',
        publicRef: `LOT-${Date.now()}`,
        title: '2019 Prado',
      },
    });
    check(listing.status === 201, `seller createListing -> 201 (got ${listing.status})`);
    const listingId = listing.json?.id;

    const submit = await post(`/listings/${listingId}/submit`, { token: sellerToken });
    check(ok2xx(submit.status), `seller submit -> 2xx (got ${submit.status})`);

    // Permission enforcement: seller cannot review.
    const sellerReview = await post(`/listings/${listingId}/review`, {
      token: sellerToken,
      body: { decision: 'approve' },
    });
    check(sellerReview.status === 403, `seller review -> 403 (got ${sellerReview.status})`);

    const review = await post(`/listings/${listingId}/review`, {
      token: staffToken,
      body: { decision: 'approve' },
    });
    check(ok2xx(review.status), `staff review approve -> 2xx (got ${review.status})`);

    const publish = await post(`/listings/${listingId}/publish`, { token: staffToken });
    check(ok2xx(publish.status), `staff publish -> 2xx (got ${publish.status})`);

    // Illegal transition: re-publishing a scheduled listing → 409.
    const republish = await post(`/listings/${listingId}/publish`, { token: staffToken });
    check(republish.status === 409, `re-publish -> 409 conflict (got ${republish.status})`);

    const media = await post(`/assets/${assetId}/media`, {
      token: staffToken,
      body: { kind: 'image', storageKey: 's3://bucket/original.jpg' },
    });
    check(media.status === 201, `register media -> 201 (got ${media.status})`);
    const derivative = await post(`/media/${media.json?.id}/derivatives`, {
      token: staffToken,
      body: { method: 'enhance-neutral-bg', storageKey: 's3://bucket/enhanced.jpg' },
    });
    check(derivative.status === 201, `add media derivative -> 201 (got ${derivative.status})`);

    // Verify the transactional outbox + append-only audit were written atomically.
    const prisma = new PrismaClient();
    try {
      const outbox = await prisma.outboxEvent.findMany({ where: { aggregateId: listingId } });
      const names = outbox.map((o) => o.name);
      check(
        names.includes('LISTING_APPROVED') && names.includes('LISTING_PUBLISHED'),
        `outbox has LISTING_APPROVED + LISTING_PUBLISHED (${names.join(', ') || 'none'})`,
      );
      check(
        outbox.every((o) => o.status === 'pending'),
        'outbox events are pending (await dispatch)',
      );

      const audits = await prisma.auditEvent.findMany({ where: { targetId: listingId } });
      const actions = audits.map((a) => a.action);
      check(
        actions.includes('LISTING_CREATED') && actions.includes('LISTING_PUBLISHED'),
        `audit trail present (${actions.join(', ') || 'none'})`,
      );

      let blocked = false;
      if (audits[0]) {
        try {
          await prisma.auditEvent.update({
            where: { id: audits[0].id },
            data: { action: 'TAMPER' },
          });
        } catch {
          blocked = true;
        }
      }
      check(blocked, 'audit UPDATE rejected (append-only)');
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll E2E data-core checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
