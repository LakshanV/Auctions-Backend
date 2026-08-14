#!/usr/bin/env node
/**
 * Phase 9 (Social Publisher) + Phase 10 (Asset Intelligence) E2E. Proves: a
 * listing gets an AI-assisted publication draft, it must be submitted and
 * approved (`social:approve`, distinct from `social:operate`) before it — or a
 * group campaign of them — can publish through the mock adapter (external post
 * ids assigned), and analytics DERIVED from real sales power Market Pulse
 * (including sell-through) + comparables + seller intelligence without ever
 * mutating sale facts. Permissions enforced (social:operate, social:approve,
 * intelligence:read); Market Pulse is public.
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

async function sellVehicle(sellerToken, staffToken, buyerToken, buyer, priceMinor) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Axio', year: 2017 } },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: {
      assetId: asset.json.id,
      saleMethod: 'TIMED_AUCTION',
      publicRef: `SI-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    },
  });
  const auction = await post('/auctions', {
    token: staffToken,
    body: {
      listingId: listing.json.id,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 60_000).toISOString(),
      openingBidMinor: priceMinor,
      incrementMinor: 10_000,
    },
  });
  await post(`/auctions/${auction.json.id}/open`, { token: staffToken });
  await post(`/auctions/${auction.json.id}/bids`, {
    token: buyerToken,
    body: { maxAmountMinor: priceMinor },
  });
  await post(`/auctions/${auction.json.id}/close`, { token: staffToken });
  return listing.json.id;
}

/** Open then immediately close an auction with NO bids -> passed in (unsold). */
async function passInVehicle(sellerToken, staffToken) {
  const asset = await post('/assets', {
    token: sellerToken,
    body: { category: 'vehicles', attributes: { make: 'Toyota', model: 'Axio', year: 2017 } },
  });
  const listing = await post('/listings', {
    token: sellerToken,
    body: {
      assetId: asset.json.id,
      saleMethod: 'TIMED_AUCTION',
      publicRef: `SI-PI-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    },
  });
  const auction = await post('/auctions', {
    token: staffToken,
    body: {
      listingId: listing.json.id,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 60_000).toISOString(),
      openingBidMinor: 1_000_000,
      incrementMinor: 10_000,
    },
  });
  await post(`/auctions/${auction.json.id}/open`, { token: staffToken });
  return post(`/auctions/${auction.json.id}/close`, { token: staffToken });
}

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
    const adminId = await registerCustomer('admin');
    const sellerToken = await token(['seller'], sellerId);
    const staffToken = await token(['auction_staff'], sellerId);
    const buyerToken = await token(['customer'], buyer);
    // Admin holds social:approve; auction_staff (above) holds only social:operate
    // — the approve gate must stay a distinct human step from drafting/operating.
    const adminToken = await token(['admin'], adminId);

    // Two completed sales in 'vehicles' → analytics have data.
    const soldA = await sellVehicle(sellerToken, staffToken, buyerToken, buyer, 2_000_000);
    await sellVehicle(sellerToken, staffToken, buyerToken, buyer, 3_000_000);

    // --- Phase 9: Social Publisher ---
    // Permission: a plain buyer cannot use social.
    const denied = await post('/social/publications', {
      token: buyerToken,
      body: { listingId: soldA, platform: 'facebook' },
    });
    check(denied.status === 403, `buyer cannot publish -> 403 (got ${denied.status})`);

    const campaign = await post('/social/campaigns', {
      token: staffToken,
      body: { name: 'Weekend Vehicles', type: 'group' },
    });
    check(campaign.status === 201, 'staff created a group campaign');

    // Draft with an auto (AI-assisted) caption — no caption supplied.
    const pub = await post('/social/publications', {
      token: staffToken,
      body: { listingId: soldA, platform: 'instagram', campaignId: campaign.json.id },
    });
    check(
      pub.status === 201 && pub.json?.status === 'draft' && /Singha/.test(pub.json?.caption ?? ''),
      'publication drafted with an auto caption',
    );

    // Approval gate (docs/11): a human must approve before ANY publish, single
    // or campaign — submit it, then approve as admin (social:approve).
    const pubSubmit = await post(`/social/publications/${pub.json.id}/submit`, {
      token: staffToken,
    });
    check(
      pubSubmit.status === 201 && pubSubmit.json?.status === 'pending_approval',
      `campaign publication submitted for approval (status=${pubSubmit.json?.status})`,
    );
    const pubApprove = await post(`/social/publications/${pub.json.id}/approve`, {
      token: adminToken,
    });
    check(
      pubApprove.status === 201 && pubApprove.json?.status === 'approved',
      `admin approved the campaign publication (status=${pubApprove.json?.status})`,
    );

    const publishedCampaign = await post(`/social/campaigns/${campaign.json.id}/publish`, {
      token: staffToken,
    });
    check(
      publishedCampaign.json?.published >= 1 &&
        publishedCampaign.json?.publications?.[0]?.externalPostId?.startsWith('mock-'),
      'group campaign published via mock adapter (external post id assigned)',
    );
    const pubList = await get(`/social/listings/${soldA}/publications`, { token: staffToken });
    check(pubList.json?.[0]?.status === 'published', 'publication now marked published');

    // --- Phase 9b: approval gate, reject flow, permission split, audit ---
    const gated = await post('/social/publications', {
      token: staffToken,
      body: { listingId: soldA, platform: 'facebook', caption: 'Gate test caption' },
    });
    check(gated.status === 201 && gated.json?.status === 'draft', 'second publication drafted');

    // Draft can't publish — must be approved first.
    const draftPublish = await post(`/social/publications/${gated.json.id}/publish`, {
      token: staffToken,
    });
    check(
      draftPublish.status === 409,
      `draft cannot publish before approval -> 409 (got ${draftPublish.status})`,
    );

    const submitted = await post(`/social/publications/${gated.json.id}/submit`, {
      token: staffToken,
    });
    check(
      submitted.status === 201 && submitted.json?.status === 'pending_approval',
      `submitted for approval -> pending_approval (got ${submitted.json?.status})`,
    );

    // Approve requires social:approve — a social:operate-only actor is refused.
    const approveDenied = await post(`/social/publications/${gated.json.id}/approve`, {
      token: staffToken,
    });
    check(
      approveDenied.status === 403,
      `social:operate-only actor cannot approve -> 403 (got ${approveDenied.status})`,
    );

    // Reject sends it back to draft — still cannot publish.
    const rejected = await post(`/social/publications/${gated.json.id}/reject`, {
      token: adminToken,
    });
    check(
      rejected.status === 201 && rejected.json?.status === 'draft',
      `admin rejected -> back to draft (got ${rejected.json?.status})`,
    );
    const stillBlocked = await post(`/social/publications/${gated.json.id}/publish`, {
      token: staffToken,
    });
    check(
      stillBlocked.status === 409,
      `rejected/draft still cannot publish -> 409 (got ${stillBlocked.status})`,
    );

    // Happy path: submit -> approve -> publish.
    await post(`/social/publications/${gated.json.id}/submit`, { token: staffToken });
    const approved = await post(`/social/publications/${gated.json.id}/approve`, {
      token: adminToken,
    });
    check(
      approved.status === 201 &&
        approved.json?.status === 'approved' &&
        approved.json?.approvedById === adminId &&
        !!approved.json?.approvedAt,
      `admin approved (status=${approved.json?.status}, approvedById correct=${approved.json?.approvedById === adminId})`,
    );
    const gatedPublish = await post(`/social/publications/${gated.json.id}/publish`, {
      token: staffToken,
    });
    check(
      gatedPublish.status === 201 &&
        gatedPublish.json?.status === 'published' &&
        gatedPublish.json?.externalPostId?.startsWith('mock-'),
      `submit->approve->publish happy path succeeds (status=${gatedPublish.json?.status})`,
    );

    // The approval is audited.
    const prisma = new PrismaClient();
    try {
      const approveAudit = await prisma.auditEvent.findFirst({
        where: { targetId: gated.json.id, action: 'SOCIAL_PUBLICATION_APPROVED' },
      });
      check(
        approveAudit?.actorType === 'staff' && approveAudit?.actorId === adminId,
        `the approval is audited (actorType=${approveAudit?.actorType}, actorId correct=${approveAudit?.actorId === adminId})`,
      );
    } finally {
      await prisma.$disconnect();
    }

    // --- Phase 10: Asset Intelligence ---
    // Market Pulse is public (no token) — rule 13.
    const pulse = await get('/intelligence/market-pulse');
    const vehicles = pulse.json?.categories?.find((c) => c.category === 'vehicles');
    check(
      pulse.status === 200 && vehicles?.salesCount >= 2 && vehicles?.totalMinor >= 5_000_000,
      `Market Pulse shows vehicles sold (count=${vehicles?.salesCount}, total=${vehicles?.totalMinor})`,
    );
    check(
      vehicles?.avgMinor === Math.round(vehicles.totalMinor / vehicles.salesCount),
      'Market Pulse average is derived correctly',
    );

    // Sell-through = soldCount / offeredCount, computed live from Auction rows
    // (status='closed' + winnerCustomerId) — never materialized. Seed one more
    // sold lot + one passed-in (unsold) lot and assert the DELTA, since a shared
    // DB may already hold closed auctions from other tests.
    const stBefore = pulse.json?.sellThrough;
    await sellVehicle(sellerToken, staffToken, buyerToken, buyer, 2_500_000);
    const passedIn = await passInVehicle(sellerToken, staffToken);
    check(
      passedIn.status === 201 &&
        passedIn.json?.status === 'closed' &&
        !passedIn.json?.winnerCustomerId,
      `seeded a passed-in (unsold) auction lot (status=${passedIn.json?.status})`,
    );
    const pulseAfter = await get('/intelligence/market-pulse');
    const stAfter = pulseAfter.json?.sellThrough;
    check(
      stAfter?.soldCount === (stBefore?.soldCount ?? 0) + 1 &&
        stAfter?.offeredCount === (stBefore?.offeredCount ?? 0) + 2,
      `sell-through: soldCount +1, offeredCount +2 (sold=${stAfter?.soldCount}, offered=${stAfter?.offeredCount})`,
    );
    check(
      stAfter?.ratio !== null &&
        Math.abs(stAfter.ratio - stAfter.soldCount / stAfter.offeredCount) < 1e-9,
      `sell-through ratio reflects sold/(sold+unsold) (${stAfter?.ratio})`,
    );

    // Comparables need permission.
    const compDenied = await get('/intelligence/comparables?category=vehicles', {
      token: buyerToken,
    });
    check(
      compDenied.status === 403,
      `buyer cannot read comparables -> 403 (got ${compDenied.status})`,
    );

    const comps = await get('/intelligence/comparables?category=vehicles', { token: staffToken });
    // Range must span this test's two sales (2M, 3M); a shared DB may hold more.
    check(
      comps.json?.count >= 2 &&
        comps.json?.suggestedRange?.minMinor <= 2_000_000 &&
        comps.json?.suggestedRange?.maxMinor >= 3_000_000,
      `comparables give a price range spanning the sales (min=${comps.json?.suggestedRange?.minMinor}, max=${comps.json?.suggestedRange?.maxMinor})`,
    );
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} social/intelligence E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll social + intelligence E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
