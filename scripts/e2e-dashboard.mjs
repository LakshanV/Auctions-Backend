#!/usr/bin/env node
/**
 * Evolution E11b Dashboard + Control Centre E2E (pack doc 11 §Dashboard/Control Centre). Boots the
 * built API with the dashboard/control-centre projections + their data sources (procurement, supply,
 * Singha ID) ON and proves:
 *  - a member's unified dashboard aggregates their Buying (procurement requests), Selling (supply
 *    programmes) and Verification (capabilities) across domains;
 *  - the operator-scoped Control Centre counts records and surfaces attention alerts (pending KYC);
 *  - operator-scoping filters record counts by operatorCode; a non-operator is denied (403).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

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
    env: {
      ...process.env,
      FEATURE_DASHBOARD: 'true',
      FEATURE_CONTROL_CENTRE: 'true',
      FEATURE_SINGHA_ID: 'true',
      FEATURE_PROCUREMENT: 'true',
      FEATURE_SUPPLY_PROGRAMMES: 'true',
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

    const memberId = await registerCustomer('dashMember');
    const member = await token(['customer'], memberId);
    const operator = await token(['auction_staff'], await registerCustomer('dashOp'));

    // ---- seed the member's cross-domain activity ----
    await post('/procurement/requests', {
      token: member,
      body: { type: 'RFQ', title: 'Need 10t steel', currency: 'USD', operatorCode: 'OP1' },
    });
    await post('/supply/programmes', {
      token: member,
      body: { product: 'Red Onion', currency: 'USD', operatorCode: 'OP1' },
    });
    await post('/singha-id/capabilities', { token: member, body: { capability: 'place_bid' } });

    // ---- the member's unified dashboard aggregates across domains ----
    const dash = await get('/dashboard', { token: member });
    check(dash.status === 200, `dashboard returns 200 (got ${dash.status})`);
    check(dash.json?.buying?.procurementRequests?.total === 1, 'buying: 1 procurement request');
    check(dash.json?.selling?.supplyProgrammes?.total === 1, 'selling: 1 supply programme');
    check(
      dash.json?.verification?.total === 1 &&
        dash.json?.verification?.byStatus?.[0]?.status === 'pending',
      'verification: 1 pending capability',
    );
    check(dash.json?.buying?.watching === 0, 'buying: watching starts at 0');

    // ---- a non-operator cannot read the Control Centre ----
    const memberCC = await get('/control-centre/overview', { token: member });
    check(memberCC.status === 403, `member Control Centre -> 403 (got ${memberCC.status})`);

    // ---- operator overview: counts + attention alerts ----
    const cc = await get('/control-centre/overview', { token: operator });
    check(
      cc.status === 200 &&
        cc.json?.counts?.supplyProgrammes >= 1 &&
        cc.json?.counts?.procurementRequests >= 1,
      'Control Centre counts records',
    );
    check(
      cc.json?.counts?.pendingVerifications >= 1 &&
        cc.json?.alerts?.some((a) => a.includes('verification')),
      'Control Centre flags pending verifications',
    );

    // ---- operator-scoping filters records by operatorCode ----
    const op1 = await get('/control-centre/overview?operatorCode=OP1', { token: operator });
    check(
      op1.json?.operatorCode === 'OP1' &&
        op1.json?.counts?.supplyProgrammes === 1 &&
        op1.json?.counts?.procurementRequests === 1,
      'operator-scoped counts include OP1 records',
    );
    const opNone = await get('/control-centre/overview?operatorCode=ZZ_NONE', { token: operator });
    check(
      opNone.json?.counts?.supplyProgrammes === 0 && opNone.json?.counts?.procurementRequests === 0,
      'operator-scoped counts exclude other operators',
    );
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} dashboard E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll dashboard / control-centre E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
