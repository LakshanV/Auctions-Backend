#!/usr/bin/env node
/**
 * Evolution E8b Payment orchestration E2E (pack doc 10). Boots the built API with
 * FEATURE_OPERATOR_PAYMENTS ON + a webhook secret, seeds PaymentRoute config, and proves:
 *  - a verified operator route resolves to an EXTERNAL regulated provider + persists an intent;
 *  - no route for an operator → MANUAL_REVIEW_REQUIRED;
 *  - an unverified/unlicensed route → non-binding preview (O4);
 *  - a bank-transfer route requires manual settlement (no internal ledger);
 *  - webhook intake is signature-verified (bad sig → 401) and idempotent (replay → duplicate);
 *  - authorization is server-side (a buyer cannot resolve a route).
 */
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import PrismaPkg from '@prisma/client';

const { PrismaClient } = PrismaPkg;
const BASE = 'http://localhost:4000';
const API = `${BASE}/api/v1`;
const SECRET = 'e2e-webhook-secret';
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
const sign = (provider, eventId, type) =>
  createHmac('sha256', SECRET).update(`${provider}:${eventId}:${type}`).digest('hex');

const routeDefaults = {
  version: 1,
  priority: 0,
  active: true,
  instructionsRef: 'ref://settlement',
  currency: null,
  jurisdiction: null,
  saleMethodCode: null,
  purpose: null,
  verification: 'verified',
};

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FEATURE_OPERATOR_PAYMENTS: 'true',
      PAYMENT_WEBHOOK_SECRET: SECRET,
    },
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

    const route = (over) =>
      prisma.paymentRoute.create({ data: { id: randomUUID(), ...routeDefaults, ...over } });
    await route({
      code: 'V_GW',
      operatorCode: 'OP_V',
      currency: 'LKR',
      provider: 'AcmePay',
      providerKind: 'operator_gateway',
    });
    await route({
      code: 'D_GW',
      operatorCode: 'OP_D',
      currency: 'LKR',
      provider: 'DraftPay',
      providerKind: 'operator_gateway',
      verification: 'draft',
    });
    await route({
      code: 'B_BANK',
      operatorCode: 'OP_B',
      currency: 'LKR',
      provider: 'OpBank',
      providerKind: 'operator_bank_transfer',
    });

    const staff = await token(['auction_staff']);
    const buyer = await token(['customer']);

    // ---- verified route resolves to an external provider ----
    const resolved = await post('/payments/resolve-route', {
      token: staff,
      body: { operatorCode: 'OP_V', currency: 'LKR', purpose: 'buyer_settlement' },
    });
    check(
      resolved.status === 201 &&
        resolved.json?.status === 'RESOLVED' &&
        resolved.json?.provider === 'AcmePay' &&
        resolved.json?.providerKind === 'operator_gateway' &&
        resolved.json?.requiresManualSettlement === false &&
        typeof resolved.json?.intentId === 'string',
      'verified operator route resolves to an external provider + persists an intent',
    );

    // ---- no route → MANUAL_REVIEW ----
    const noRoute = await post('/payments/resolve-route', {
      token: staff,
      body: { operatorCode: 'OP_NONE', currency: 'LKR', purpose: 'buyer_settlement' },
    });
    check(
      noRoute.json?.status === 'MANUAL_REVIEW_REQUIRED' && noRoute.json?.routeCode === null,
      'no configured route → MANUAL_REVIEW_REQUIRED',
    );

    // ---- unverified route → preview (O4) ----
    const draft = await post('/payments/resolve-route', {
      token: staff,
      body: { operatorCode: 'OP_D', currency: 'LKR', purpose: 'buyer_settlement' },
    });
    check(
      draft.json?.status === 'MANUAL_REVIEW_REQUIRED' && draft.json?.routeCode === 'D_GW',
      'unverified/unlicensed route → non-binding preview (O4)',
    );

    // ---- bank transfer → manual settlement ----
    const bank = await post('/payments/resolve-route', {
      token: staff,
      body: { operatorCode: 'OP_B', currency: 'LKR', purpose: 'seller_payout' },
    });
    check(
      bank.json?.status === 'RESOLVED' && bank.json?.requiresManualSettlement === true,
      'bank-transfer route requires manual settlement (no internal ledger)',
    );

    // ---- webhook: signed + idempotent ----
    const bad = await post('/payments/webhook', {
      body: { provider: 'acme', eventId: 'evt1', type: 'paid', signature: 'wrong', payload: {} },
    });
    check(bad.status === 401, `webhook with a bad signature -> 401 (got ${bad.status})`);

    const sig = sign('acme', 'evt1', 'paid');
    const ok = await post('/payments/webhook', {
      body: {
        provider: 'acme',
        eventId: 'evt1',
        type: 'paid',
        signature: sig,
        payload: { ok: true },
      },
    });
    check(
      ok.status === 201 && ok.json?.received === true && ok.json?.duplicate === false,
      'a correctly-signed webhook is accepted',
    );
    const replay = await post('/payments/webhook', {
      body: {
        provider: 'acme',
        eventId: 'evt1',
        type: 'paid',
        signature: sig,
        payload: { ok: true },
      },
    });
    check(
      replay.json?.received === true && replay.json?.duplicate === true,
      'a replayed webhook is idempotent (duplicate no-op)',
    );

    // ---- authorization ----
    const forbidden = await post('/payments/resolve-route', {
      token: buyer,
      body: { operatorCode: 'OP_V', currency: 'LKR', purpose: 'buyer_settlement' },
    });
    check(
      forbidden.status === 403,
      `a buyer cannot resolve a route -> 403 (got ${forbidden.status})`,
    );

    // ---- persistence ----
    const intents = await prisma.paymentIntent.count();
    const hooks = await prisma.paymentWebhookEvent.count({
      where: { provider: 'acme', eventId: 'evt1' },
    });
    check(intents >= 4, `payment intents persisted (count=${intents})`);
    check(hooks === 1, `webhook event stored exactly once despite replay (count=${hooks})`);
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} payments E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll payments E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
