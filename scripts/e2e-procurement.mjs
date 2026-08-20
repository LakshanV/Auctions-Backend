#!/usr/bin/env node
/**
 * Evolution E9 Procurement / reverse-tender E2E (pack doc 09). Boots the built API with
 * FEATURE_PROCUREMENT ON and proves the buyer-initiated two-sided market:
 *  - a buyer posts an RFQ; suppliers submit proposals;
 *  - proposals rank cheapest-first (recommendation only);
 *  - an award before the window closes is refused;
 *  - only the owning buyer may close/award/view proposals (others 403);
 *  - the buyer awards an EXPLICIT choice — even the dearest — proving the cheapest is never
 *    auto-awarded (§09 / D4); losers are rejected;
 *  - a request carries an EXPLICIT acting context: creating for an organization the caller does not
 *    belong to is refused (403), an `organizationId` in a personal request is refused (400), and a
 *    member's creation is stamped with a durable `buyer_organization_id`;
 *  - the personal and organization request books stay disjoint on read, and one organization can
 *    never see another's requests.
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

    // ---- organization-attributed requests: explicit context + authorization ----
    const stamp = Date.now();
    const orgOwnerId = await registerCustomer('procOrgOwner');
    const orgOwner = await token(['seller'], orgOwnerId);
    const colleagueId = await registerCustomer('procColleague');
    const colleague = await token(['customer'], colleagueId);
    const rivalOwnerId = await registerCustomer('procRivalOwner');
    const rivalOwner = await token(['seller'], rivalOwnerId);
    const admin = await token(['admin'], await registerCustomer('procAdmin'));

    const orgA = await post('/organizations', {
      token: orgOwner,
      body: { legalName: 'Alpha Trading (Pvt) Ltd', publicRef: `proc-org-a-${stamp}` },
    });
    const orgB = await post('/organizations', {
      token: rivalOwner,
      body: { legalName: 'Beta Trading (Pvt) Ltd', publicRef: `proc-org-b-${stamp}` },
    });
    check(orgA.status === 201 && orgB.status === 201, 'two organizations created');
    const orgAId = orgA.json.id;
    const orgBId = orgB.json.id;

    const addMember = await post(`/organizations/${orgAId}/members`, {
      token: orgOwner,
      body: { customerId: colleagueId, role: 'staff' },
    });
    check(addMember.status === 201, `colleague added to org A (got ${addMember.status})`);

    const orgRfq = (t, oid, title) =>
      post('/procurement/requests', {
        token: t,
        body: {
          type: 'RFQ',
          title,
          currency: 'USD',
          context: 'organization',
          organizationId: oid,
        },
      });

    // A non-member cannot create for the organization, and existence is not leaked.
    const strangerCreate = await orgRfq(stranger, orgAId, 'stranger tries org A');
    check(
      strangerCreate.status === 403,
      `non-member cannot create for an organization -> 403 (got ${strangerCreate.status})`,
    );
    const unknownOrgCreate = await orgRfq(stranger, 'org_missing', 'stranger tries a ghost org');
    check(
      unknownOrgCreate.status === 403,
      `unknown organization does not leak existence -> 403 (got ${unknownOrgCreate.status})`,
    );

    // Shape rules: an id is required for an organization context and refused for a personal one.
    const noOrgId = await post('/procurement/requests', {
      token: orgOwner,
      body: { type: 'RFQ', title: 'no id', currency: 'USD', context: 'organization' },
    });
    check(noOrgId.status === 400, `organization context with no id -> 400 (got ${noOrgId.status})`);
    const smuggled = await post('/procurement/requests', {
      token: orgOwner,
      body: {
        type: 'RFQ',
        title: 'smuggled',
        currency: 'USD',
        context: 'personal',
        organizationId: orgAId,
      },
    });
    check(
      smuggled.status === 400,
      `organizationId in a personal creation -> 400 (got ${smuggled.status})`,
    );

    // Members create for the organization; the attribution is stamped durably.
    const ownerOrgReq = await orgRfq(orgOwner, orgAId, 'Org A: 50t copper');
    const colleagueOrgReq = await orgRfq(colleague, orgAId, 'Org A: 20t zinc');
    const rivalOrgReq = await orgRfq(rivalOwner, orgBId, 'Org B: 10t tin');
    check(
      ownerOrgReq.status === 201 && ownerOrgReq.json?.buyerOrganizationId === orgAId,
      'a member creates an organization-attributed request',
    );
    check(
      colleagueOrgReq.status === 201 && colleagueOrgReq.json?.context === 'organization',
      'a colleague also creates into the organization book',
    );
    const persisted = await prisma.procurementRequest.findUnique({
      where: { id: ownerOrgReq.json.id },
    });
    check(
      persisted?.buyerOrganizationId === orgAId && persisted?.buyerCustomerId === orgOwnerId,
      'the row keeps BOTH the durable organization attribution and the poster of record',
    );

    // The owner's own personal request stays in the personal book.
    const ownerPersonal = await post('/procurement/requests', {
      token: orgOwner,
      body: { type: 'RFQ', title: 'Owner personal: 1t brass', currency: 'USD' },
    });
    check(
      ownerPersonal.status === 201 && ownerPersonal.json?.buyerOrganizationId === null,
      'a request with no context defaults to the personal book (null attribution)',
    );

    // ---- the two books are disjoint on read ----
    const personalList = await get('/procurement/requests/mine', { token: orgOwner });
    const personalIds = (personalList.json?.requests ?? []).map((r) => r.id);
    check(
      personalList.json?.context?.kind === 'personal' &&
        personalIds.includes(ownerPersonal.json.id) &&
        !personalIds.includes(ownerOrgReq.json.id),
      'the personal list excludes the organization-attributed request',
    );

    const orgList = await get(
      `/procurement/requests/mine?context=organization&organizationId=${orgAId}`,
      { token: orgOwner },
    );
    const orgIds = (orgList.json?.requests ?? []).map((r) => r.id);
    check(
      orgList.json?.context?.organizationId === orgAId &&
        orgIds.includes(ownerOrgReq.json.id) &&
        orgIds.includes(colleagueOrgReq.json.id) &&
        !orgIds.includes(ownerPersonal.json.id),
      "the organization list includes a colleague's request and excludes personal ones",
    );
    check(
      !orgIds.includes(rivalOrgReq.json.id),
      "one organization's list never contains another organization's requests",
    );

    const crossOrgList = await get(
      `/procurement/requests/mine?context=organization&organizationId=${orgBId}`,
      { token: orgOwner },
    );
    check(
      crossOrgList.status === 403,
      `reading another organization's book -> 403 (got ${crossOrgList.status})`,
    );

    const staffList = await get(
      `/procurement/requests/mine?context=organization&organizationId=${orgAId}`,
      { token: admin },
    );
    check(
      staffList.status === 200 && staffList.json?.context?.viaStaffPermission === true,
      `organization:manage staff may read the organization book (got ${staffList.status})`,
    );

    // ---- management authorization follows the RECORD's book ----
    const colleagueCloses = await post(`/procurement/requests/${ownerOrgReq.json.id}/close`, {
      token: colleague,
    });
    check(
      colleagueCloses.status === 201,
      `a colleague may manage the organization's request (got ${colleagueCloses.status})`,
    );
    const rivalCloses = await post(`/procurement/requests/${colleagueOrgReq.json.id}/close`, {
      token: rivalOwner,
    });
    check(
      rivalCloses.status === 403,
      `another organization's member cannot manage it -> 403 (got ${rivalCloses.status})`,
    );
    const colleagueTouchesPersonal = await post(
      `/procurement/requests/${ownerPersonal.json.id}/close`,
      { token: colleague },
    );
    check(
      colleagueTouchesPersonal.status === 403,
      `a personal request is unreachable from any organization membership -> 403 (got ${colleagueTouchesPersonal.status})`,
    );
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
