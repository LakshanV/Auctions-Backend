#!/usr/bin/env node
/**
 * Evolution E6 Transaction Routing + two-layer Terms E2E (pack doc 07). Boots the built API with
 * FEATURE_TRANSACTION_ROUTING ON, seeds RoutingRule / TermsDocument config directly (owner config,
 * not an API surface), and proves the deterministic engine end-to-end:
 *  - no matching rule → MANUAL_REVIEW_REQUIRED;
 *  - a verified rule → RESOLVED with operator / payment route / terms + a persisted decision;
 *  - the MOST SPECIFIC verified rule wins;
 *  - an unverified (draft) rule is a non-binding preview (MANUAL_REVIEW_REQUIRED) — D7;
 *  - a KYC-required rule holds until the party is verified;
 *  - two-layer terms resolve (platform + transaction), MANUAL_REVIEW when a layer is unverified;
 *  - authorization is server-side (a buyer cannot resolve).
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

const ruleDefaults = {
  priority: 0,
  category: null,
  marketCode: null,
  jurisdiction: null,
  operatorCode: null,
  originNodeCode: null,
  destinationCountry: null,
  transactionOperatorCode: null,
  paymentRouteCode: null,
  termsCode: null,
  disclosure: null,
  requiresKyc: false,
  requiresLicence: false,
};

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEATURE_TRANSACTION_ROUTING: 'true' },
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

    // ---- seed routing config (owner config, inserted directly) ----
    const rule = (over) =>
      prisma.routingRule.create({
        data: { id: randomUUID(), version: 1, active: true, ...ruleDefaults, ...over },
      });
    await rule({
      code: 'E6_A',
      saleMethodCode: 'E6_A',
      marketCode: 'LK',
      transactionOperatorCode: 'OP_LK',
      paymentRouteCode: 'PAY_LK',
      termsCode: 'TERMS_LK',
      verification: 'verified',
    });
    await rule({
      code: 'E6_B',
      saleMethodCode: 'E6_B',
      transactionOperatorCode: 'OP_B',
      verification: 'draft',
    });
    await rule({
      code: 'E6_C_ANY',
      saleMethodCode: 'E6_C',
      transactionOperatorCode: 'OP_C_ANY',
      verification: 'verified',
    });
    await rule({
      code: 'E6_C_LK',
      saleMethodCode: 'E6_C',
      marketCode: 'LK',
      transactionOperatorCode: 'OP_C_LK',
      verification: 'verified',
    });
    await rule({
      code: 'E6_D',
      saleMethodCode: 'E6_D',
      transactionOperatorCode: 'OP_D',
      requiresKyc: true,
      verification: 'verified',
    });

    const termsDoc = (over) =>
      prisma.termsDocument.create({
        data: {
          id: randomUUID(),
          version: 1,
          active: true,
          operatorCode: null,
          jurisdiction: null,
          category: null,
          saleMethodCode: null,
          bodyRef: 'ref://legal',
          ...over,
        },
      });
    await termsDoc({ code: 'PLATFORM_TERMS', layer: 'PLATFORM', verification: 'verified' });
    await termsDoc({
      code: 'TX_E6T',
      layer: 'TRANSACTION',
      saleMethodCode: 'E6_T',
      verification: 'verified',
    });
    await termsDoc({
      code: 'TX_E6U',
      layer: 'TRANSACTION',
      saleMethodCode: 'E6_U',
      verification: 'draft',
    });

    const staff = await token(['auction_staff']);
    const buyer = await token(['customer']); // customer role lacks exchange:operate

    // ---- resolution ----
    const none = await post('/routing/resolve', {
      token: staff,
      body: { saleMethodCode: 'E6_NONE' },
    });
    check(
      none.status === 201 &&
        none.json?.status === 'MANUAL_REVIEW_REQUIRED' &&
        none.json?.matchedRuleCode === null,
      'no matching rule → MANUAL_REVIEW_REQUIRED',
    );

    const resolved = await post('/routing/resolve', {
      token: staff,
      body: { saleMethodCode: 'E6_A', marketCode: 'LK' },
    });
    check(
      resolved.status === 201 &&
        resolved.json?.status === 'RESOLVED' &&
        resolved.json?.transactionOperatorCode === 'OP_LK' &&
        resolved.json?.paymentRouteCode === 'PAY_LK' &&
        resolved.json?.termsCode === 'TERMS_LK' &&
        typeof resolved.json?.decisionId === 'string',
      'verified rule → RESOLVED with operator/route/terms + a persisted decision',
    );

    const draft = await post('/routing/resolve', {
      token: staff,
      body: { saleMethodCode: 'E6_B' },
    });
    check(
      draft.status === 201 &&
        draft.json?.status === 'MANUAL_REVIEW_REQUIRED' &&
        draft.json?.transactionOperatorCode === 'OP_B',
      'draft rule → non-binding preview (MANUAL_REVIEW_REQUIRED, D7)',
    );

    const specific = await post('/routing/resolve', {
      token: staff,
      body: { saleMethodCode: 'E6_C', marketCode: 'LK' },
    });
    check(
      specific.json?.status === 'RESOLVED' && specific.json?.transactionOperatorCode === 'OP_C_LK',
      'most-specific verified rule wins (OP_C_LK over the wildcard OP_C_ANY)',
    );

    const kycMissing = await post('/routing/resolve', {
      token: staff,
      body: { saleMethodCode: 'E6_D', kycVerified: false },
    });
    check(
      kycMissing.json?.status === 'MANUAL_REVIEW_REQUIRED' &&
        (kycMissing.json?.requiredVerification ?? []).includes('KYC'),
      'KYC-required rule holds until the party is KYC-verified',
    );
    const kycOk = await post('/routing/resolve', {
      token: staff,
      body: { saleMethodCode: 'E6_D', kycVerified: true },
    });
    check(
      kycOk.json?.status === 'RESOLVED',
      'KYC-required rule resolves once the party is verified',
    );

    // ---- two-layer terms ----
    const terms = await post('/routing/terms', { token: staff, body: { saleMethodCode: 'E6_T' } });
    check(
      terms.json?.status === 'RESOLVED' &&
        terms.json?.platform?.code === 'PLATFORM_TERMS' &&
        terms.json?.transaction?.code === 'TX_E6T',
      'two-layer terms resolve (platform + transaction)',
    );
    const draftTerms = await post('/routing/terms', {
      token: staff,
      body: { saleMethodCode: 'E6_U' },
    });
    check(
      draftTerms.json?.status === 'MANUAL_REVIEW_REQUIRED',
      'unverified transaction terms → MANUAL_REVIEW_REQUIRED (D7)',
    );

    // ---- authorization ----
    const forbidden = await post('/routing/resolve', {
      token: buyer,
      body: { saleMethodCode: 'E6_A' },
    });
    check(
      forbidden.status === 403,
      `a buyer cannot resolve routing -> 403 (got ${forbidden.status})`,
    );

    // ---- persistence ----
    const decisions = await prisma.routingDecision.count();
    check(decisions >= 6, `routing decisions persisted (count=${decisions})`);
    const resolvedDecision = await prisma.routingDecision.findFirst({
      where: { matchedRuleCode: 'E6_A', status: 'RESOLVED' },
    });
    check(
      resolvedDecision?.transactionOperatorCode === 'OP_LK',
      'a persisted decision records the matched rule + resolved operator',
    );
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} routing E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll routing E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
