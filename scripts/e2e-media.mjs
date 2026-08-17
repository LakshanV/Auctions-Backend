#!/usr/bin/env node
/**
 * RW3 secure media pipeline E2E (docs/06; pack FIX-03..07). Proves the server-side controls that
 * do not depend on a configured object store:
 *   - upload policy: a disallowed content type -> 415, an oversize file -> 413, at both the
 *     upload-grant and the registration steps (enforced before any storage call);
 *   - authorized download: a signed-URL request for a PRIVATE object is object-level authorized —
 *     the owner passes, a DIFFERENT seller is refused (media IDOR), an anonymous caller is 401;
 *   - a PUBLIC object does not require asset ownership.
 * The malware-rejection gate needs a real uploaded object (storage) and is covered by the domain
 * unit tests (screenStorageKeyForMalware); here we only assert the storage-independent controls.
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

// storage may be unconfigured locally → a control that PASSES authorization/policy then reaches
// storage returns 503; treat 200/201/503 as "passed the gate we are testing".
const passedGate = (status) => status === 200 || status === 201 || status === 503;

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

    const sellerAId = await registerCustomer('media-seller-a');
    const sellerBId = await registerCustomer('media-seller-b');
    const sellerA = await token(['seller'], sellerAId);
    const sellerB = await token(['seller'], sellerBId);

    // sellerA owns assetA (owner = creating principal's customerId).
    const asset = await post('/assets', {
      token: sellerA,
      body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Prado', year: 2018 } },
    });
    const assetId = asset.json?.id;
    check(!!assetId, `sellerA created assetA (${assetId})`);

    // --- upload-grant policy (before any storage call) -------------------------
    const grantExe = await post(`/assets/${assetId}/media/upload-url`, {
      token: sellerA,
      body: { filename: 'malware.exe', kind: 'document', contentType: 'application/x-msdownload' },
    });
    check(
      grantExe.status === 415,
      `upload-url: executable content type -> 415 (got ${grantExe.status})`,
    );

    const grantBig = await post(`/assets/${assetId}/media/upload-url`, {
      token: sellerA,
      body: {
        filename: 'huge.mp4',
        kind: 'video',
        contentType: 'video/mp4',
        sizeBytes: 5_000_000_000,
      },
    });
    check(grantBig.status === 413, `upload-url: oversize video -> 413 (got ${grantBig.status})`);

    const grantPdf = await post(`/assets/${assetId}/media/upload-url`, {
      token: sellerA,
      body: { filename: 'certificate.pdf', kind: 'document', contentType: 'application/pdf' },
    });
    check(
      passedGate(grantPdf.status),
      `upload-url: allowed PDF passes policy (got ${grantPdf.status})`,
    );

    // --- registration policy (before idempotency/stat) -------------------------
    const regExe = await post(`/assets/${assetId}/media`, {
      token: sellerA,
      body: {
        kind: 'document',
        storageKey: `assets/${assetId}/x-evil.exe`,
        mimeType: 'application/x-msdownload',
      },
    });
    check(regExe.status === 415, `register: executable content type -> 415 (got ${regExe.status})`);

    const regBig = await post(`/assets/${assetId}/media`, {
      token: sellerA,
      body: {
        kind: 'image',
        storageKey: `assets/${assetId}/huge.png`,
        mimeType: 'image/png',
        sizeBytes: 5_000_000_000,
      },
    });
    check(regBig.status === 413, `register: oversize image -> 413 (got ${regBig.status})`);

    // --- authorized download of a PRIVATE document (media IDOR guard) ----------
    const priv = await prisma.mediaObject.create({
      data: {
        id: `med_priv_${Date.now()}`,
        assetId,
        kind: 'document',
        storageKey: `assets/${assetId}/deed-scan.pdf`,
        status: 'ready',
        isOriginal: true,
        visibility: 'private',
      },
    });
    const dlOther = await get(`/media/${priv.id}/download-url`, { token: sellerB });
    check(
      dlOther.status === 403,
      `private download by a different seller -> 403 IDOR (got ${dlOther.status})`,
    );

    const dlAnon = await get(`/media/${priv.id}/download-url`, {});
    check(
      dlAnon.status === 401 || dlAnon.status === 403,
      `private download anonymous -> 401/403 (got ${dlAnon.status})`,
    );

    const dlOwner = await get(`/media/${priv.id}/download-url`, { token: sellerA });
    check(
      passedGate(dlOwner.status),
      `private download by the OWNER passes authorization (got ${dlOwner.status})`,
    );

    // --- a PUBLIC object does not require asset ownership ----------------------
    const pub = await prisma.mediaObject.create({
      data: {
        id: `med_pub_${Date.now()}`,
        assetId,
        kind: 'image',
        storageKey: `assets/${assetId}/front.jpg`,
        status: 'ready',
        isOriginal: true,
        visibility: 'public',
      },
    });
    const dlPub = await get(`/media/${pub.id}/download-url`, { token: sellerB });
    check(
      dlPub.status !== 403 && dlPub.status !== 404,
      `public download does not require ownership (got ${dlPub.status})`,
    );

    // --- unknown media -> 404 -------------------------------------------------
    const dl404 = await get(`/media/med_does_not_exist/download-url`, { token: sellerA });
    check(dl404.status === 404, `unknown media -> 404 (got ${dl404.status})`);

    await prisma.$disconnect();
    if (failures > 0) {
      console.error(`\n✗ e2e-media: ${failures} check(s) failed`);
      process.exit(1);
    }
    console.log('\n✓ e2e-media: all checks passed');
  } finally {
    child.kill('SIGKILL');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
