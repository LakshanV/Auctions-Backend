#!/usr/bin/env node
/**
 * Evolution E9 Procurement / reverse-tender E2E (pack doc 09). Boots the built API with
 * FEATURE_PROCUREMENT ON and proves the buyer-initiated two-sided market:
 *  - a buyer posts an RFQ; suppliers submit proposals;
 *  - proposals rank cheapest-first (recommendation only);
 *  - an award before the window closes is refused;
 *  - only the owning buyer may close/award/view proposals (others 403);
 *  - the buyer awards an EXPLICIT choice — even the dearest — proving the cheapest is never
 *    auto-awarded (§09 / D4); losers are rejected.
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

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEATURE_PROCUREMENT: 'true' },
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

    const buyerId = await registerCustomer('procBuyer');
    const buyer = await token(['customer'], buyerId);
    const supA = await token(['customer'], await registerCustomer('procA'));
    const supB = await token(['customer'], await registerCustomer('procB'));
    const supC = await token(['customer'], await registerCustomer('procC'));
    const stranger = await token(['customer'], await registerCustomer('procX'));

    // ---- buyer posts an RFQ ----
    const created = await post('/procurement/requests', {
      token: buyer,
      body: {
        type: 'REVERSE_TENDER',
        title: '100t steel billets',
        currency: 'USD',
        category: 'metals',
      },
    });
    check(created.status === 201 && created.json?.status === 'open', 'buyer posts an RFQ (open)');
    const requestId = created.json.id;

    const submit = (t, total) =>
      post(`/procurement/requests/${requestId}/proposals`, {
        token: t,
        body: { proposal: { currency: 'USD', totalPriceMinor: total } },
      });
    const pA = await submit(supA, 3_000_000); // dearest
    const pB = await submit(supB, 1_000_000); // cheapest
    const pC = await submit(supC, 2_000_000);
    check(
      pA.status === 201 && pB.status === 201 && pC.status === 201,
      'three suppliers submit proposals',
    );

    // ---- award before close is refused ----
    const early = await post(`/procurement/requests/${requestId}/award`, {
      token: buyer,
      body: { selectedProposalId: pB.json.id },
    });
    check(early.status === 409, `award before close -> 409 (got ${early.status})`);

    // ---- only the owner may manage the request ----
    const strangerClose = await post(`/procurement/requests/${requestId}/close`, {
      token: stranger,
    });
    check(
      strangerClose.status === 403,
      `non-owner cannot close -> 403 (got ${strangerClose.status})`,
    );

    const closed = await post(`/procurement/requests/${requestId}/close`, { token: buyer });
    check(closed.status === 201 && closed.json?.status === 'closed', 'buyer closes the window');

    // ---- ranked cheapest-first (recommendation only) ----
    const view = await get(`/procurement/requests/${requestId}/proposals`, { token: buyer });
    check(
      view.json?.suppliers === 3 &&
        view.json?.ranked?.map((r) => r.proposalId).join(',') ===
          [pB.json.id, pC.json.id, pA.json.id].join(','),
      'proposals rank cheapest-first (B, C, A) — recommendation only',
    );
    const strangerView = await get(`/procurement/requests/${requestId}/proposals`, {
      token: stranger,
    });
    check(
      strangerView.status === 403,
      `non-owner cannot view proposals -> 403 (got ${strangerView.status})`,
    );

    // ---- buyer awards the DEAREST explicitly (never auto-cheapest) ----
    const award = await post(`/procurement/requests/${requestId}/award`, {
      token: buyer,
      body: { selectedProposalId: pA.json.id },
    });
    check(
      award.status === 201 && award.json?.awardedProposalId === pA.json.id,
      'buyer awards an EXPLICIT choice — the dearest (A), proving no auto-cheapest (§09 / D4)',
    );

    // ---- DB assertions ----
    const request = await prisma.procurementRequest.findUnique({ where: { id: requestId } });
    check(
      request?.status === 'awarded' && request?.awardedProposalId === pA.json.id,
      'request marked awarded to the explicitly-chosen proposal',
    );
    const winner = await prisma.procurementProposal.findUnique({ where: { id: pA.json.id } });
    const loser = await prisma.procurementProposal.findUnique({ where: { id: pB.json.id } });
    check(winner?.status === 'accepted', 'winning proposal accepted');
    check(loser?.status === 'rejected', 'losing (cheapest) proposal rejected');
  } finally {
    await prisma.$disconnect();
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} procurement E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll procurement E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
