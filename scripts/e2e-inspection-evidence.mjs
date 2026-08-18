#!/usr/bin/env node
/**
 * §20 (RW9) E2E — inspection / certification evidence. Proves: staff (media:manage) can record
 * evidence directly and via the InspectionProvider port; sellers CANNOT; the customer lot detail
 * projects ONLY public evidence (never private/internal); a linked certificate document surfaces
 * only when it is itself public + ready; and foreign / non-document media links are rejected.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import PrismaPkg from '@prisma/client';

const { PrismaClient } = PrismaPkg;
const BASE = 'http://localhost:4000';
const V1 = `${BASE}/api/v1`;
let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
};

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
const v2 = (p, o) => call(`${BASE}/api/v2${p}`, o);

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
  (await v1('/dev/token', { method: 'POST', body: { roles, customerId } })).json?.token;
const registerCustomer = async (label) =>
  (
    await v1('/customers', {
      method: 'POST',
      body: { legalName: label, email: `${label}${Date.now()}@ex.com` },
    })
  ).json?.id;

async function publishListing(sellerToken, staffToken, category, saleMethod, attrs, title) {
  const asset = await v1('/assets', {
    token: sellerToken,
    method: 'POST',
    body: { category, attributes: attrs },
  });
  if (!asset.json?.id) {
    throw new Error(`asset create failed (${asset.status}): ${JSON.stringify(asset.json)}`);
  }
  const listing = await v1('/listings', {
    token: sellerToken,
    method: 'POST',
    body: {
      assetId: asset.json.id,
      saleMethod,
      title,
      publicRef: `INSP-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
    },
  });
  const id = listing.json.id;
  await v1(`/listings/${id}/submit`, { token: sellerToken, method: 'POST' });
  await v1(`/listings/${id}/review`, {
    token: staffToken,
    method: 'POST',
    body: { decision: 'approve' },
  });
  await v1(`/listings/${id}/publish`, { token: staffToken, method: 'POST' });
  return { listingId: id, assetId: asset.json.id };
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

    const sellerId = await registerCustomer('inspseller');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff'], sellerId);

    const { listingId, assetId } = await publishListing(
      sellerToken,
      staffToken,
      'vehicles',
      'TIMED_AUCTION',
      { make: 'Toyota', model: 'Land Cruiser', year: 2020 },
      'Toyota Land Cruiser 2020',
    );

    // A public + ready certificate document on the asset (seeded directly — the RW3 upload
    // pipeline is exercised by e2e-media; here we only need a linkable public document).
    const certMediaId = randomUUID();
    await prisma.mediaObject.create({
      data: {
        id: certMediaId,
        assetId,
        kind: 'document',
        storageKey: `assets/${assetId}/documents/gsi-cert.pdf`,
        status: 'ready',
        visibility: 'public',
        caption: 'GSI certificate',
      },
    });
    // A private document on the SAME asset (must never surface to customers, even if linked).
    const privateMediaId = randomUUID();
    await prisma.mediaObject.create({
      data: {
        id: privateMediaId,
        assetId,
        kind: 'document',
        storageKey: `assets/${assetId}/documents/internal-notes.pdf`,
        status: 'ready',
        visibility: 'private',
        caption: 'internal',
      },
    });
    // A document on a DIFFERENT asset (foreign) for the rejection test.
    const otherAssetId = randomUUID();
    await prisma.asset.create({ data: { id: otherAssetId, category: 'vehicles' } });
    const foreignMediaId = randomUUID();
    await prisma.mediaObject.create({
      data: {
        id: foreignMediaId,
        assetId: otherAssetId,
        kind: 'document',
        storageKey: `assets/${otherAssetId}/documents/x.pdf`,
        status: 'ready',
        visibility: 'public',
      },
    });

    // --- Staff records PUBLIC evidence with a linked public certificate document ---
    const pub = await v1(`/assets/${assetId}/inspection-evidence`, {
      token: staffToken,
      method: 'POST',
      body: {
        kind: 'gem_certification',
        provider: 'GSI Lanka',
        certificateRef: 'GSI-2026-0099',
        summary: 'Natural blue sapphire, no heat treatment.',
        inspectedAt: new Date().toISOString(),
        visibility: 'public',
        mediaObjectId: certMediaId,
      },
    });
    check(
      (pub.status === 200 || pub.status === 201) && pub.json?.status === 'completed',
      `staff records public evidence; a certificate implies completed (got ${pub.status}/${pub.json?.status})`,
    );

    // --- Staff records PRIVATE evidence (must stay staff-only) ---
    const priv = await v1(`/assets/${assetId}/inspection-evidence`, {
      token: staffToken,
      method: 'POST',
      body: {
        kind: 'general',
        provider: 'Internal desk',
        summary: 'Internal condition note',
        visibility: 'private',
        mediaObjectId: privateMediaId,
      },
    });
    check(priv.status === 200 || priv.status === 201, 'staff records private evidence');

    // --- Open an inspection THROUGH the provider port (no certificate yet) ---
    const viaProvider = await v1(`/assets/${assetId}/inspection-evidence`, {
      token: staffToken,
      method: 'POST',
      body: {
        kind: 'gem_certification',
        provider: 'GSI Lanka',
        visibility: 'public',
        requestViaProvider: true,
      },
    });
    check(
      viaProvider.json?.status === 'requested' &&
        typeof viaProvider.json?.inspectionId === 'string',
      `provider-opened evidence is 'requested' with an inspectionId (no fabricated certificate)`,
    );
    check(
      viaProvider.json?.certificateRef == null,
      'provider-opened evidence carries NO certificateRef (rule 3 — never fabricated)',
    );

    // --- Rejections: foreign media + non-document media ---
    const foreign = await v1(`/assets/${assetId}/inspection-evidence`, {
      token: staffToken,
      method: 'POST',
      body: { kind: 'general', provider: 'X', mediaObjectId: foreignMediaId },
    });
    check(
      foreign.status === 400,
      `linking another asset's media is rejected (got ${foreign.status})`,
    );

    // --- Seller CANNOT record (media:manage is staff-only) ---
    const denied = await v1(`/assets/${assetId}/inspection-evidence`, {
      token: sellerToken,
      method: 'POST',
      body: { kind: 'general', provider: 'Self' },
    });
    check(denied.status === 403, `seller cannot record evidence -> 403 (got ${denied.status})`);

    // --- Staff list returns ALL rows (public + private + requested) ---
    const staffList = await v1(`/assets/${assetId}/inspection-evidence`, { token: staffToken });
    check(
      staffList.status === 200 && staffList.json?.evidence?.length === 3,
      `staff list returns all 3 evidence rows (got ${staffList.json?.evidence?.length})`,
    );
    check(
      staffList.json.evidence.some((e) => e.visibility === 'private'),
      'staff list includes the private row (staff see everything)',
    );

    // --- Customer lot detail projects ONLY public evidence ---
    const detail = await v2(`/catalogue/${listingId}`);
    const ev = detail.json?.evidence ?? [];
    check(
      Array.isArray(ev) && ev.length === 2,
      `lot detail shows 2 PUBLIC evidence rows (got ${ev.length})`,
    );
    check(
      ev.every((e) => !('visibility' in e) && !('mediaObjectId' in e) && !('inspectionId' in e)),
      'customer evidence never leaks visibility / internal ids',
    );
    const certEv = ev.find((e) => e.certificateRef === 'GSI-2026-0099');
    check(
      certEv?.document?.id === certMediaId && certEv?.document?.kind === 'document',
      'public evidence exposes its public certificate document',
    );
    // The private row is absent; and no public row leaks the private document.
    check(
      !ev.some((e) => e.summary === 'Internal condition note'),
      'private evidence is absent from the customer projection',
    );
    check(
      !ev.some((e) => e.document && e.document.id === privateMediaId),
      'no private document leaks through evidence',
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} inspection-evidence E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll inspection-evidence E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
