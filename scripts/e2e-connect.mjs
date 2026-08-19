#!/usr/bin/env node
/**
 * Phase 7 Singha Connect E2E (docs/09). Proves: inbound ingestion resolves a
 * customer only via a VERIFIED external identity; a conversation threads inbound
 * + outbound (mock adapter) messages; AI↔human handoff; and — critically (rule
 * 11) — a channel bid is a two-step INTENT → explicit CONFIRM that is validated
 * by the authoritative auction engine (the confirm produces the real bid; the
 * intent alone does not).
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

    const sellerId = await registerCustomer('seller');
    const buyer = await registerCustomer('buyer');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff']);
    const supportToken = await token(['support']);
    const buyerToken = await token(['customer'], buyer);

    // --- Inbound: unresolved (no linked identity) then resolved (verified) ---
    const anon = await post('/connect/inbound', {
      token: staffToken,
      body: {
        channel: 'whatsapp',
        externalThreadId: 'wa-thread-1',
        externalUserId: '9477000',
        text: 'Hi',
      },
    });
    check(
      anon.status === 201 && anon.json?.customerResolved === false,
      'inbound from unknown number is unresolved',
    );

    // Link + verify the buyer's WhatsApp identity, then a new inbound resolves.
    await post(`/customers/${buyer}/external-identities`, {
      token: buyerToken,
      body: { channel: 'whatsapp', externalId: '94771234567' },
    });
    // Mark verified directly (KYC/identity verification is out of band here).
    const prisma = new PrismaClient();
    await prisma.externalIdentity.updateMany({
      where: { channel: 'whatsapp', externalId: '94771234567' },
      data: { verifiedAt: new Date() },
    });

    const known = await post('/connect/inbound', {
      token: staffToken,
      body: {
        channel: 'whatsapp',
        externalThreadId: 'wa-thread-2',
        externalUserId: '94771234567',
        text: 'Interested in the Hiace',
      },
    });
    check(
      known.status === 201 && known.json?.customerResolved === true,
      'inbound from a verified identity resolves to the customer',
    );
    const conversationId = known.json.conversationId;

    // Outbound via the mock adapter + threaded history.
    const sent = await post(`/connect/conversations/${conversationId}/messages`, {
      token: supportToken,
      body: { text: 'Sure — it is lot LOT-DEMO-5', provenance: 'staff' },
    });
    check(sent.status === 201 && sent.json?.via === 'mock', 'outbound sent via mock adapter');
    const convo = await get(`/connect/conversations/${conversationId}`, { token: supportToken });
    check(
      convo.json?.messages?.length === 2,
      `conversation threads 2 messages (got ${convo.json?.messages?.length})`,
    );

    // AI → human handoff.
    const handoff = await post(`/connect/conversations/${conversationId}/mode`, {
      token: supportToken,
      body: { aiMode: false },
    });
    check(
      handoff.json?.aiMode === false && handoff.json?.assignedAgentId,
      'handed off to a human agent',
    );

    // ── Agent Inbox (§4) ──────────────────────────────────────────────────────
    const anonConversationId = anon.json.conversationId;
    const inbox = await get('/connect/conversations', { token: staffToken });
    check(
      Array.isArray(inbox.json?.conversations) &&
        inbox.json.conversations.some((c) => c.id === conversationId),
      'agent inbox lists conversations',
    );
    const byChannel = await get('/connect/conversations?channel=whatsapp', { token: staffToken });
    check(
      byChannel.json?.conversations?.every((c) => c.channel === 'whatsapp'),
      'inbox filters by channel',
    );
    // wa-thread-1 has only an inbound message → awaiting staff; wa-thread-2's last msg is outbound.
    const awaiting = await get('/connect/conversations?awaitingReply=true', { token: staffToken });
    const awaitingIds = (awaiting.json?.conversations ?? []).map((c) => c.id);
    check(
      awaitingIds.includes(anonConversationId) && !awaitingIds.includes(conversationId),
      'awaitingReply filter surfaces only threads whose last message is inbound',
    );
    check(
      (awaiting.json?.conversations ?? []).every((c) => c.waitingOnStaff === true),
      'every awaiting row is flagged waitingOnStaff with a wait time',
    );
    const inboxForbidden = await get('/connect/conversations', { token: buyerToken });
    check(
      inboxForbidden.status === 403,
      `customer cannot read the agent inbox -> 403 (${inboxForbidden.status})`,
    );

    // Explicit assignment to a named agent (switches to human handling).
    const assigned = await post(`/connect/conversations/${conversationId}/assign`, {
      token: staffToken,
      body: { agentId: 'agent-jenny' },
    });
    check(
      assigned.json?.assignedAgentId === 'agent-jenny' && assigned.json?.aiMode === false,
      'explicit assign sets the agent + human handling',
    );
    const assignForbidden = await post(`/connect/conversations/${conversationId}/assign`, {
      token: buyerToken,
      body: {},
    });
    check(
      assignForbidden.status === 403,
      `customer cannot assign -> 403 (${assignForbidden.status})`,
    );

    // AI-suggested reply — ADVISORY: returns a draft, sends NOTHING, creates no message.
    const before = await get(`/connect/conversations/${conversationId}`, { token: staffToken });
    const suggest = await post(`/connect/conversations/${conversationId}/suggest-reply`, {
      token: staffToken,
    });
    check(
      suggest.status === 201 &&
        typeof suggest.json?.suggestion === 'string' &&
        suggest.json?.sent === false &&
        suggest.json?.blocked === false,
      'suggest-reply returns an advisory draft (sent=false)',
    );
    const after = await get(`/connect/conversations/${conversationId}`, { token: staffToken });
    check(
      after.json?.messages?.length === before.json?.messages?.length,
      'suggest-reply created NO message (nothing sent to the customer)',
    );
    const suggestForbidden = await post(`/connect/conversations/${conversationId}/suggest-reply`, {
      token: buyerToken,
    });
    check(
      suggestForbidden.status === 403,
      `customer cannot request an AI suggestion -> 403 (${suggestForbidden.status})`,
    );

    // Resolve, then a new inbound reopens the thread (§4 lifecycle).
    const resolved = await post(`/connect/conversations/${conversationId}/resolve`, {
      token: staffToken,
    });
    check(resolved.json?.status === 'resolved', 'agent resolves a conversation');
    const resolvedList = await get('/connect/conversations?status=resolved', { token: staffToken });
    check(
      (resolvedList.json?.conversations ?? []).some((c) => c.id === conversationId),
      'resolved thread appears under the resolved filter',
    );
    await post('/connect/inbound', {
      token: staffToken,
      body: {
        channel: 'whatsapp',
        externalThreadId: 'wa-thread-2',
        externalUserId: '94771234567',
        text: 'One more question',
      },
    });
    const reopened = await get(`/connect/conversations/${conversationId}`, { token: staffToken });
    check(reopened.json?.status === 'open', 'a new inbound reopens a resolved thread');

    // --- Channel bidding: INTENT then explicit CONFIRM (rule 11) ---
    const asset = await post('/assets', {
      token: sellerToken,
      body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Hiace', year: 2020 } },
    });
    const listing = await post('/listings', {
      token: sellerToken,
      body: { assetId: asset.json.id, saleMethod: 'TIMED_AUCTION', publicRef: `CN-${Date.now()}` },
    });
    const auction = await post('/auctions', {
      token: staffToken,
      body: {
        listingId: listing.json.id,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        openingBidMinor: 1_000_000,
        incrementMinor: 50_000,
      },
    });
    const auctionId = auction.json.id;
    await post(`/auctions/${auctionId}/open`, { token: staffToken });

    const intent = await post('/connect/bid-intents', {
      token: buyerToken,
      body: { auctionId, maxAmountMinor: 2_000_000, channel: 'whatsapp' },
    });
    check(
      intent.status === 201 &&
        intent.json?.status === 'pending' &&
        intent.json?.confirmationRequired === true &&
        intent.json?.lot?.publicRef,
      'bid intent is pending + returns lot/amount context (no bid yet)',
    );

    // Before confirmation, NO bid exists on the auction.
    const beforeState = await get(`/auctions/${auctionId}/state`);
    check(
      beforeState.json?.bidCount === 0,
      `no bid before confirm (bidCount=${beforeState.json?.bidCount})`,
    );

    const confirm = await post(`/connect/bid-intents/${intent.json.bidIntentId}/confirm`, {
      token: buyerToken,
    });
    check(
      confirm.status === 201 &&
        confirm.json?.status === 'placed' &&
        confirm.json?.bid?.currentBidMinor === 1_000_000,
      `confirm places the real bid at opening (${confirm.json?.bid?.currentBidMinor})`,
    );
    const afterState = await get(`/auctions/${auctionId}/state`);
    check(
      afterState.json?.bidCount === 1,
      `exactly one bid after confirm (bidCount=${afterState.json?.bidCount})`,
    );

    // Double-confirm is rejected (single-use intent).
    const again = await post(`/connect/bid-intents/${intent.json.bidIntentId}/confirm`, {
      token: buyerToken,
    });
    check(again.status === 409, `re-confirming a placed intent -> 409 (got ${again.status})`);

    try {
      const bidBySource = await prisma.bid.findFirst({ where: { auctionId } });
      check(
        bidBySource?.source === 'absentee',
        `channel bid recorded with 'absentee' source (got ${bidBySource?.source})`,
      );
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} connect E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll connect E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
