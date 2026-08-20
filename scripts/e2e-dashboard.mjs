#!/usr/bin/env node
/**
 * Evolution E11b Cockpit (Dashboard) + Control Centre E2E (pack doc 11 §Dashboard/Control Centre).
 * Boots the built API with the dashboard/control-centre projections + their data sources
 * (procurement, supply, Singha ID) ON and proves:
 *  - a member's unified cockpit aggregates their Buying (procurement requests), Selling (supply
 *    programmes) and Verification (capabilities) across domains, in the PERSONAL context;
 *  - the cockpit context is explicit and server-authorized: an organization context the caller is
 *    not a member of is refused (403), a member's own organization is admitted, and an
 *    `organizationId` smuggled into a personal request is refused (400);
 *  - the personal and organization books never leak into each other;
 *  - every monetary aggregate is grouped by contractual currency, with no cross-currency total;
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

    // ---- the member's unified cockpit aggregates across domains ----
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

    // ---- the cockpit context is explicit and server-authorized ----
    const sellerId = await registerCustomer('dashSeller');
    const sellerToken = await token(['seller'], sellerId);
    const org = await post('/organizations', {
      token: sellerToken,
      body: { legalName: 'Dash Traders (Pvt) Ltd', publicRef: `dash-org-${Date.now()}` },
    });
    check(org.status === 201 || org.status === 200, `organization created (got ${org.status})`);
    const orgId = org.json?.id;

    check(
      dash.json?.context?.kind === 'personal',
      'no context parameter defaults to the personal book',
    );
    const explicit = await get('/dashboard?context=personal', { token: member });
    check(
      explicit.status === 200 && explicit.json?.context?.kind === 'personal',
      'an explicit personal context resolves to the personal book',
    );

    const smuggled = await get(`/dashboard?context=personal&organizationId=${orgId}`, {
      token: member,
    });
    check(
      smuggled.status === 400,
      `organizationId in a personal request -> 400 (got ${smuggled.status})`,
    );

    const noId = await get('/dashboard?context=organization', { token: sellerToken });
    check(noId.status === 400, `organization context with no id -> 400 (got ${noId.status})`);

    const stranger = await get(`/dashboard?context=organization&organizationId=${orgId}`, {
      token: member,
    });
    check(
      stranger.status === 403,
      `non-member organization context -> 403 (got ${stranger.status})`,
    );

    const unknownOrg = await get('/dashboard?context=organization&organizationId=org_missing', {
      token: member,
    });
    check(
      unknownOrg.status === 403,
      `unknown organization does not leak existence -> 403 (got ${unknownOrg.status})`,
    );

    const owned = await get(`/dashboard?context=organization&organizationId=${orgId}`, {
      token: sellerToken,
    });
    check(
      owned.status === 200 && owned.json?.context?.organizationId === orgId,
      `the owner reads their organization cockpit (got ${owned.status})`,
    );
    check(owned.json?.context?.role === 'owner', 'organization context echoes the member role');
    check(
      owned.json?.scope?.organizationRecordsIncluded === true &&
        owned.json?.scope?.personalRecordsIncluded === false,
      'organization cockpit declares it drew from the organization book only',
    );

    // ---- personal and organization books do not leak into each other ----
    await post('/procurement/requests', {
      token: sellerToken,
      body: { type: 'RFQ', title: 'Seller personal RFQ', currency: 'USD', operatorCode: 'OP1' },
    });
    const sellerPersonal = await get('/dashboard', { token: sellerToken });
    check(
      sellerPersonal.json?.buying?.procurementRequests?.total === 1,
      'the seller sees their own procurement request in the personal context',
    );
    const ownedAfter = await get(`/dashboard?context=organization&organizationId=${orgId}`, {
      token: sellerToken,
    });
    check(
      ownedAfter.json?.buying?.procurementRequests?.total === 0 &&
        ownedAfter.json?.buying?.watching === 0 &&
        ownedAfter.json?.verification?.total === 0,
      'personal buy-side / verification records do NOT appear in the organization cockpit',
    );
    check(
      Array.isArray(ownedAfter.json?.scope?.notes) && ownedAfter.json.scope.notes.length > 0,
      'organization cockpit explains which books it excluded',
    );

    // ---- money is grouped by contractual currency, never a cross-currency total ----
    const aggregates = [
      dash.json?.money?.buying?.openOffers,
      dash.json?.money?.buying?.purchases,
      dash.json?.money?.buying?.invoicesOutstanding,
      dash.json?.money?.selling?.sales,
    ];
    check(
      aggregates.every((a) => a && Array.isArray(a.byCurrency) && Array.isArray(a.currencies)),
      'every monetary aggregate is grouped by currency',
    );
    check(
      aggregates.every((a) => a.total === undefined && a.totalMinor === undefined),
      'no monetary aggregate exposes a cross-currency scalar total',
    );

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
        op1.json?.counts?.procurementRequests === 2,
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
  console.log('\nAll cockpit / control-centre E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
