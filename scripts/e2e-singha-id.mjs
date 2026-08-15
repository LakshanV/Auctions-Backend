#!/usr/bin/env node
/**
 * Evolution E11 Singha ID E2E (pack doc 11 §Singha ID). Boots the built API with FEATURE_SINGHA_ID
 * ON and proves the geography-neutral member profile + **capability-based verification**:
 *  - a member edits one profile (display currency / language / roles) — no country-specific account;
 *  - browse-class activities are always permitted; a gated activity (place_bid) requires verification;
 *  - a member requests a capability (pending); only an operator may decide it (member decide → 403);
 *  - once an operator verifies it, the gated activity is permitted; deciding a non-pending → 409;
 *  - an expired grant no longer permits the activity (automatic expiry).
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
const put = (p, o) => req('PUT', p, o);

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

const FUTURE = '2027-01-01T00:00:00.000Z';
const PAST = '2020-01-01T00:00:00.000Z';

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEATURE_SINGHA_ID: 'true' },
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

    const memberId = await registerCustomer('sidMember');
    const member = await token(['customer'], memberId);
    const operator = await token(['auction_staff'], await registerCustomer('sidOp'));
    const stranger = await token(['customer'], await registerCustomer('sidX'));

    // ---- one geography-neutral profile ----
    const p0 = await get('/singha-id/profile', { token: member });
    check(
      p0.status === 200 &&
        Array.isArray(p0.json?.companyRoles) &&
        p0.json.companyRoles.length === 0,
      'member has one profile (defaults) — no country-specific account',
    );
    const upd = await put('/singha-id/profile', {
      token: member,
      body: {
        displayCurrency: 'USD',
        language: 'en',
        countryResidency: 'LK',
        companyRoles: ['buyer'],
        notificationPrefs: { email: true },
      },
    });
    check(upd.status === 200, 'member updates profile preferences');
    const p1 = await get('/singha-id/profile', { token: member });
    check(
      p1.json?.displayCurrency === 'USD' && p1.json?.companyRoles?.[0] === 'buyer',
      'profile preferences persist (display currency + roles)',
    );

    // ---- capability-based verification ----
    const browse = await get('/singha-id/evaluate/browse', { token: member });
    check(
      browse.json?.permitted === true && browse.json?.reason === 'OPEN',
      'browse is always open',
    );

    const bidBefore = await get('/singha-id/evaluate/place_bid', { token: member });
    check(
      bidBefore.json?.permitted === false && bidBefore.json?.reason === 'VERIFICATION_REQUIRED',
      'a gated activity (place_bid) requires verification when unverified',
    );

    const request = await post('/singha-id/capabilities', {
      token: member,
      body: { capability: 'place_bid', evidenceRef: 'doc-1' },
    });
    check(
      request.status === 201 && request.json?.status === 'pending',
      'member requests place_bid (pending)',
    );

    const bidPending = await get('/singha-id/evaluate/place_bid', { token: member });
    check(
      bidPending.json?.reason === 'VERIFICATION_PENDING',
      'a pending request does not yet permit the activity',
    );

    // ---- only an operator decides ----
    const memberDecide = await post('/singha-id/capabilities/decide', {
      token: member,
      body: { customerId: memberId, capability: 'place_bid', decision: 'verified' },
    });
    check(
      memberDecide.status === 403,
      `a member cannot decide a capability -> 403 (got ${memberDecide.status})`,
    );

    const decide = await post('/singha-id/capabilities/decide', {
      token: operator,
      body: {
        customerId: memberId,
        capability: 'place_bid',
        decision: 'verified',
        expiresAt: FUTURE,
      },
    });
    check(
      decide.status === 201 && decide.json?.status === 'verified',
      'operator verifies the capability',
    );

    const bidAfter = await get('/singha-id/evaluate/place_bid', { token: member });
    check(
      bidAfter.json?.permitted === true && bidAfter.json?.reason === 'VERIFIED',
      'the gated activity is permitted once verified',
    );

    // ---- deciding a non-pending capability is refused ----
    const reDecide = await post('/singha-id/capabilities/decide', {
      token: operator,
      body: { customerId: memberId, capability: 'place_bid', decision: 'rejected' },
    });
    check(
      reDecide.status === 409,
      `deciding a non-pending capability -> 409 (got ${reDecide.status})`,
    );

    // ---- an expired grant no longer permits ----
    await post('/singha-id/capabilities', { token: member, body: { capability: 'sell' } });
    await post('/singha-id/capabilities/decide', {
      token: operator,
      body: { customerId: memberId, capability: 'sell', decision: 'verified', expiresAt: PAST },
    });
    const sell = await get('/singha-id/evaluate/sell', { token: member });
    check(
      sell.json?.permitted === false && sell.json?.reason === 'VERIFICATION_EXPIRED',
      'an expired verification no longer permits the activity (automatic expiry)',
    );

    // ---- unknown request → 404 ----
    const missing = await post('/singha-id/capabilities/decide', {
      token: operator,
      body: { customerId: memberId, capability: 'import', decision: 'verified' },
    });
    check(
      missing.status === 404,
      `deciding an un-requested capability -> 404 (got ${missing.status})`,
    );

    // stranger cannot see the member's profile as their own (isolation: they get their own defaults)
    const strangerProfile = await get('/singha-id/profile', { token: stranger });
    check(
      strangerProfile.json?.displayCurrency === null,
      'profiles are per-member (a different member sees their own empty profile)',
    );

    // ---- DB assertions ----
    const profileRow = await prisma.customerProfile.findUnique({ where: { customerId: memberId } });
    check(profileRow?.displayCurrency === 'USD', 'profile row persisted');
    const bidCap = await prisma.customerCapability.findUnique({
      where: { customerId_capability: { customerId: memberId, capability: 'place_bid' } },
    });
    check(bidCap?.status === 'verified', 'place_bid capability persisted verified');
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} Singha ID E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll Singha ID E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
