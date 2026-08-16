#!/usr/bin/env node
/**
 * AIC-2 E2E — cross-channel continuity + "Chat now / WhatsApp / Call me" (docs/09/10). Boots the
 * built API against a real database and proves, over real HTTP:
 *   - a requested channel not in config `assistantChannels` is rejected (400) and nothing is
 *     recorded (constraint 4);
 *   - with whatsapp/voice enabled: a whatsapp request returns a deep-link + continuity token,
 *     records exactly one system Message, and the ack is sent ONLY through MockChannelProvider
 *     (constraint 3 — never a real send); a voice request records a non-binding callback
 *     request; NEITHER ever creates a BidIntent/Bid;
 *   - continuity: a `/connect/inbound` carrying the continuity token attaches to the SAME
 *     conversationId as the original web conversation (no duplicate Conversation row),
 *     preserving the item-context subject; identity is re-verified server-side — an unverified
 *     or cross-customer attempt is denied (404), never trusting the token alone (constraint 2);
 *   - human handoff: after `setMode(aiMode:false)`, the agent-facing `GET
 *     /connect/conversations/:id` still carries the FULL message history + a derived
 *     `handoffSummary` (latest question + item-context);
 *   - `FEATURE_AI_CONVERSATION=false` disables the whole channel-request surface too.
 * Mirrors scripts/e2e-assistant.mjs's per-flag-state single-spawn convention.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import PrismaPkg from '@prisma/client';

const { PrismaClient } = PrismaPkg;
let failures = 0;

function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
}

function makeClient(base) {
  const v1 = `${base}/api/v1`;
  async function req(method, path, { token, body } = {}) {
    const res = await fetch(`${v1}${path}`, {
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
  return { post: (p, o) => req('POST', p, o), get: (p, o) => req('GET', p, o) };
}

async function waitForHealth(base) {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) return true;
    } catch {
      /* not up */
    }
    await sleep(500);
  }
  return false;
}

/** Boot the built API with the given env overlay; returns { child, base, api }. Caller must kill(). */
async function bootServer(envOverlay) {
  const port = envOverlay.PORT ?? '4000';
  const base = `http://localhost:${port}`;
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...envOverlay },
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));
  if (!(await waitForHealth(base))) {
    console.error('API did not start:\n' + logs.join(''));
    child.kill('SIGKILL');
    process.exit(1);
  }
  return { child, base, api: makeClient(base) };
}

async function publishTimedAuction(api, sellerToken, staffToken) {
  const asset = await api.post('/assets', {
    token: sellerToken,
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Axio', year: 2019 } },
  });
  const listing = await api.post('/listings', {
    token: sellerToken,
    body: {
      assetId: asset.json.id,
      saleMethod: 'TIMED_AUCTION',
      title: 'Toyota Axio 2019',
      publicRef: `AICCH-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
    },
  });
  const listingId = listing.json.id;
  await api.post(`/listings/${listingId}/submit`, { token: sellerToken });
  await api.post(`/listings/${listingId}/review`, {
    token: staffToken,
    body: { decision: 'approve' },
  });
  await api.post(`/listings/${listingId}/publish`, { token: staffToken });
  const auction = await api.post('/auctions', {
    token: staffToken,
    body: {
      listingId,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      openingBidMinor: 1_500_000,
      incrementMinor: 25_000,
    },
  });
  return { listingId, auctionId: auction.json.id };
}

/** Phase 1 — flag ON, but assistantChannels defaults to ['web'] only: both are rejected. */
async function runDisabledChannelsPhase() {
  console.log('\n== AIC-2 E2E: FEATURE_AI_CONVERSATION=true, ASSISTANT_CHANNELS=web (default) ==');
  const { child, api } = await bootServer({
    FEATURE_AI_CONVERSATION: 'true',
    ASSISTANT_CHANNELS: 'web',
    PORT: '4010',
  });
  const prisma = new PrismaClient();

  try {
    const buyerId = (
      await api.post('/customers', {
        body: { legalName: 'aic2-buyer-off', email: `aic2off${Date.now()}@ex.com` },
      })
    ).json?.id;
    const buyerToken = (
      await api.post('/dev/token', { body: { roles: ['customer'], customerId: buyerId } })
    ).json?.token;

    const ask = await api.post('/assistant/message', {
      token: buyerToken,
      body: { message: 'Hello?' },
    });
    const conversationId = ask.json.conversationId;
    const before = await prisma.message.count({ where: { conversationId } });

    const wa = await api.post('/assistant/channel-request', {
      token: buyerToken,
      body: { conversationId, channel: 'whatsapp' },
    });
    check(wa.status === 400, `disabled whatsapp channel-request -> 400 (got ${wa.status})`);

    const voice = await api.post('/assistant/channel-request', {
      token: buyerToken,
      body: { conversationId, channel: 'voice' },
    });
    check(voice.status === 400, `disabled voice channel-request -> 400 (got ${voice.status})`);

    const after = await prisma.message.count({ where: { conversationId } });
    check(
      before === after,
      `nothing recorded for a rejected channel-request (${before} -> ${after})`,
    );

    await prisma.$disconnect();
  } finally {
    child.kill('SIGKILL');
  }
}

/** Phase 2 — flag ON + assistantChannels enables whatsapp/voice: the full happy/continuity/handoff surface. */
async function runEnabledChannelsPhase() {
  console.log(
    '\n== AIC-2 E2E: FEATURE_AI_CONVERSATION=true, ASSISTANT_CHANNELS=web,whatsapp,voice ==',
  );
  const { child, api } = await bootServer({
    FEATURE_AI_CONVERSATION: 'true',
    ASSISTANT_CHANNELS: 'web,whatsapp,voice',
    PORT: '4011',
  });
  const prisma = new PrismaClient();

  try {
    const registerCustomer = async (label) =>
      (
        await api.post('/customers', {
          body: { legalName: label, email: `${label}${Date.now()}@ex.com` },
        })
      ).json?.id;
    const token = async (roles, customerId) =>
      (await api.post('/dev/token', { body: { roles, customerId } })).json?.token;
    const linkWhatsapp = async (customerId, customerToken, phone, verified) => {
      await api.post(`/customers/${customerId}/external-identities`, {
        token: customerToken,
        body: { channel: 'whatsapp', externalId: phone },
      });
      if (verified) {
        await prisma.externalIdentity.updateMany({
          where: { channel: 'whatsapp', externalId: phone },
          data: { verifiedAt: new Date() },
        });
      }
    };

    // This script runs against a PERSISTENT (non-ephemeral) database — see the task's e2e
    // instructions — so phone numbers (unique per `ExternalIdentity.externalId`) must be unique
    // PER RUN, not just per call within a run, or a second run collides with the first run's
    // leftover linked identity and silently resolves to the WRONG (stale) customer.
    const runSeed = Date.now();
    const buyerId = await registerCustomer('aic2-buyer');
    const otherBuyerId = await registerCustomer('aic2-buyer-2');
    const sellerId = await registerCustomer('aic2-seller');
    const buyerToken = await token(['customer'], buyerId);
    const otherBuyerToken = await token(['customer'], otherBuyerId);
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff'], sellerId);
    const supportToken = await token(['support']);

    const { listingId, auctionId } = await publishTimedAuction(api, sellerToken, staffToken);

    // --- Seed a web conversation with item-context (constraint: preserve context across channels) ---
    const ask = await api.post('/assistant/message', {
      token: buyerToken,
      body: {
        listingId,
        url: 'https://singha.example/lots/toyota-axio',
        message: 'When does this lot close, and can I inspect it first?',
      },
    });
    const conversationId = ask.json.conversationId;
    check(typeof conversationId === 'string', 'seeded web conversation with item-context');

    // --- WhatsApp channel-request: deep-link + continuity token, ONE system Message, mock-only ---
    const waPhone = `wa${runSeed}p1`;
    await linkWhatsapp(buyerId, buyerToken, waPhone, true);

    const beforeMsgCount = await prisma.message.count({ where: { conversationId } });
    const wa = await api.post('/assistant/channel-request', {
      token: buyerToken,
      body: { conversationId, channel: 'whatsapp', phone: waPhone },
    });
    check(wa.status === 201 || wa.status === 200, `whatsapp channel-request ok (${wa.status})`);
    check(
      typeof wa.json?.deepLink === 'string' && wa.json.deepLink.length > 0,
      'deep-link returned',
    );
    check(
      wa.json?.deepLink?.includes(wa.json?.continuityToken),
      'deep-link carries the continuity token',
    );
    check(typeof wa.json?.continuityToken === 'string', 'continuityToken returned');
    check(wa.json?.callbackRequested === undefined, 'whatsapp response has no callbackRequested');
    const continuityToken = wa.json.continuityToken;

    const afterMsgCount = await prisma.message.count({ where: { conversationId } });
    check(afterMsgCount === beforeMsgCount + 1, 'exactly ONE system Message recorded');
    const waMessage = await prisma.message.findFirst({
      where: { conversationId, provenance: 'system' },
      orderBy: { createdAt: 'desc' },
    });
    check(waMessage?.provenance === 'system', 'the recorded message has provenance=system');
    check(
      typeof waMessage?.providerMessageId === 'string' &&
        waMessage.providerMessageId.startsWith('mock-'),
      `WhatsApp ack sent ONLY through MockChannelProvider (providerMessageId=${waMessage?.providerMessageId})`,
    );
    check(
      waMessage?.payload?.channelRequest?.channel === 'whatsapp' &&
        waMessage?.payload?.channelRequest?.continuityToken === continuityToken,
      'message payload carries the channelRequest event',
    );

    // --- Voice channel-request: non-binding callback request, no provider send ---
    const voice = await api.post('/assistant/channel-request', {
      token: buyerToken,
      body: { conversationId, channel: 'voice', phone: '94772222222' },
    });
    check(
      voice.status === 201 || voice.status === 200,
      `voice channel-request ok (${voice.status})`,
    );
    check(voice.json?.callbackRequested === true, 'voice returns callbackRequested=true');
    check(voice.json?.deepLink === undefined, 'voice response has no deepLink');
    const voiceMessage = await prisma.message.findFirst({
      where: { conversationId, provenance: 'system' },
      orderBy: { createdAt: 'desc' },
    });
    check(
      voiceMessage?.payload?.channelRequest?.channel === 'voice' &&
        voiceMessage?.payload?.channelRequest?.callbackRequested === true,
      'voice callback request recorded in message payload',
    );
    check(
      voiceMessage?.providerMessageId == null,
      'voice never touches the channel provider (no providerMessageId)',
    );

    // --- Non-binding (constraint 3): neither request ever creates a BidIntent/Bid ---
    const bidIntentCount = await prisma.bidIntent.count({ where: { customerId: buyerId } });
    check(bidIntentCount === 0, 'no BidIntent was ever created by a channel-request');
    const auctionState = await api.get(`/auctions/${auctionId}/state`);
    check(auctionState.json?.bidCount === 0, 'no bid was ever placed by a channel-request');

    // --- Continuity: the token attaches to the SAME conversation, preserving item-context ---
    const conversationsBefore = await prisma.conversation.count({ where: { customerId: buyerId } });
    const continue1 = await api.post('/connect/inbound', {
      token: staffToken,
      body: {
        channel: 'whatsapp',
        externalThreadId: `wa-continue-${Date.now()}`,
        externalUserId: waPhone,
        text: 'Following up from WhatsApp — still interested!',
        continuityToken,
      },
    });
    check(continue1.status === 201, `continuation inbound accepted (status=${continue1.status})`);
    check(
      continue1.json?.conversationId === conversationId,
      `continuation resolves to the SAME conversationId (got ${continue1.json?.conversationId}, want ${conversationId})`,
    );
    const conversationsAfter = await prisma.conversation.count({ where: { customerId: buyerId } });
    check(
      conversationsAfter === conversationsBefore,
      `no duplicate Conversation row created (before=${conversationsBefore}, after=${conversationsAfter})`,
    );

    const continuedMessage = await prisma.message.findUnique({
      where: { id: continue1.json.messageId },
    });
    check(
      continuedMessage?.payload?.subject?.listingId === listingId,
      'the continued message preserves the original item-context subject (listingId matches)',
    );

    // --- Identity re-verification: unverified identity is denied ---
    const unverifiedPhone = `wa${runSeed}p2`;
    await linkWhatsapp(buyerId, buyerToken, unverifiedPhone, false); // linked, NOT verified
    const unverifiedAttempt = await api.post('/connect/inbound', {
      token: staffToken,
      body: {
        channel: 'whatsapp',
        externalThreadId: `wa-unverified-${Date.now()}`,
        externalUserId: unverifiedPhone,
        text: 'trying to continue',
        continuityToken,
      },
    });
    check(
      unverifiedAttempt.status === 404,
      `an unverified identity is denied (got ${unverifiedAttempt.status})`,
    );

    // --- Identity re-verification: a DIFFERENT (verified) customer cannot use this token ---
    const strangerPhone = `wa${runSeed}p3`;
    await linkWhatsapp(otherBuyerId, otherBuyerToken, strangerPhone, true);
    const crossCustomerAttempt = await api.post('/connect/inbound', {
      token: staffToken,
      body: {
        channel: 'whatsapp',
        externalThreadId: `wa-stranger-${Date.now()}`,
        externalUserId: strangerPhone,
        text: 'trying to hijack',
        continuityToken,
      },
    });
    check(
      crossCustomerAttempt.status === 404,
      `a different verified customer cannot use another customer's token (got ${crossCustomerAttempt.status})`,
    );

    // --- Malformed token is denied too ---
    const malformedAttempt = await api.post('/connect/inbound', {
      token: staffToken,
      body: {
        channel: 'whatsapp',
        externalThreadId: `wa-malformed-${Date.now()}`,
        externalUserId: waPhone,
        text: 'garbage token',
        continuityToken: 'not-a-real-token',
      },
    });
    check(
      malformedAttempt.status === 404,
      `a malformed token is denied (got ${malformedAttempt.status})`,
    );

    // --- Human handoff: agent view still carries full history + item-context after setMode ---
    const handoff = await api.post(`/connect/conversations/${conversationId}/mode`, {
      token: supportToken,
      body: { aiMode: false },
    });
    check(handoff.json?.aiMode === false, 'handed off to a human agent');

    const agentView = await api.get(`/connect/conversations/${conversationId}`, {
      token: supportToken,
    });
    check(
      agentView.status === 200,
      `agent can read the conversation post-handoff (${agentView.status})`,
    );
    check(
      Array.isArray(agentView.json?.messages) && agentView.json.messages.length === 5,
      `agent view carries the FULL history: customer + ai + whatsapp-request + voice-request + continuation = 5 (got ${agentView.json?.messages?.length})`,
    );
    // By now the customer's MOST RECENT message is the WhatsApp continuation reply (not the
    // original web question) — handoffSummary correctly reflects that (the freshest thing the
    // customer said, cross-channel), while itemContext still carries the ORIGINAL lot subject,
    // preserved across the channel switch (constraint 2's "keeps context").
    check(
      agentView.json?.handoffSummary?.latestQuestion?.includes('Following up'),
      `handoffSummary carries the MOST RECENT customer message, even cross-channel (got ${JSON.stringify(agentView.json?.handoffSummary?.latestQuestion)})`,
    );
    check(
      agentView.json?.handoffSummary?.itemContext?.listingId === listingId,
      'handoffSummary still carries the ORIGINAL item-context, preserved across the channel switch',
    );

    await prisma.$disconnect();
  } finally {
    child.kill('SIGKILL');
  }
}

/** Phase 3 — flag OFF: the channel-request surface 404s too, same as the rest of /assistant/*. */
async function runFlagOffPhase() {
  console.log('\n== AIC-2 E2E: FEATURE_AI_CONVERSATION unset (default false) ==');
  const { child, api } = await bootServer({ FEATURE_AI_CONVERSATION: 'false', PORT: '4012' });

  try {
    const buyerId = (
      await api.post('/customers', {
        body: { legalName: 'aic2-flagoff-buyer', email: `aic2flagoff${Date.now()}@ex.com` },
      })
    ).json?.id;
    const buyerToken = (
      await api.post('/dev/token', { body: { roles: ['customer'], customerId: buyerId } })
    ).json?.token;

    const wa = await api.post('/assistant/channel-request', {
      token: buyerToken,
      body: { conversationId: 'whatever-id', channel: 'whatsapp' },
    });
    check(wa.status === 404, `flag off -> POST /assistant/channel-request 404s (got ${wa.status})`);
  } finally {
    child.kill('SIGKILL');
  }
}

async function main() {
  await runDisabledChannelsPhase();
  await runEnabledChannelsPhase();
  await runFlagOffPhase();

  if (failures > 0) {
    console.error(`\n${failures} assistant-channels E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll assistant-channels E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
