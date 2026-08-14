#!/usr/bin/env node
/**
 * Engagement Engine HTTP E2E (pack doc 05). Proves the notification policy + delivery
 * pipeline end-to-end against a real Postgres with the fake provider:
 *
 *   - preference read/update (channels, opt-in, quiet hours, caps, category mutes);
 *   - engagement requires opt-in; transactional is mandatory (bypasses opt-in, quiet
 *     hours, caps and mutes) and keeps an in-app floor;
 *   - de-duplication / idempotency of a re-emitted event;
 *   - quiet-hours hold + frequency cap (engagement) with transactional exempt;
 *   - provider failure → retry → dead-letter, recorded in the append-only ledger;
 *   - the whole surface is gated on `engagementV3` (404 when OFF).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'http://localhost:4000';
const V1 = `${BASE}/api/v1`;
let failures = 0;

function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
}

async function call(url, { token, method = 'GET', body } = {}) {
  const res = await fetch(url, {
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
const v1 = (p, o) => call(`${V1}${p}`, o);

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
async function startApi(extraEnv) {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv },
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));
  if (!(await waitForHealth())) {
    console.error('API did not start:\n' + logs.join(''));
    process.exit(1);
  }
  return child;
}
const stop = (child) =>
  new Promise((resolve) => {
    if (!child) return resolve();
    child.on('exit', resolve);
    child.kill('SIGKILL');
  });

const token = async (roles, customerId) =>
  (await v1('/dev/token', { method: 'POST', body: { roles, customerId } })).json?.token;
const registerCustomer = async (label, emailOverride) =>
  (
    await v1('/customers', {
      method: 'POST',
      body: {
        legalName: label,
        email: emailOverride ?? `${label}${Date.now()}${Math.random()}@ex.com`,
        phone: `+9477${Math.floor(Math.random() * 1e7)}`,
      },
    })
  ).json?.id;

const engagementEvent = (subjectId, over = {}) => ({
  eventType: 'ENDING_SOON',
  classification: 'engagement',
  subjectId,
  title: 'A lot you follow is ending soon',
  body: 'Bidding closes in an hour.',
  ...over,
});

async function main() {
  let child = await startApi({ FEATURE_V3_ENGAGEMENT: 'true' });
  try {
    const custId = await registerCustomer('eng-user');
    const tok = await token(['customer'], custId);

    // --- Preferences: safe defaults, then update -------------------------------
    const defaults = await v1('/engagement/preferences', { token: tok });
    check(
      defaults.status === 200 &&
        defaults.json.engagementOptIn === false &&
        defaults.json.channels.email === true,
      'default preferences: engagement OFF, email channel ON',
    );

    // Engagement before opt-in is suppressed.
    const preOptIn = await v1('/engagement/notifications/simulate', {
      token: tok,
      method: 'POST',
      body: engagementEvent('lot-1'),
    });
    check(
      preOptIn.json?.suppressed === true && preOptIn.json?.reason === 'not_opted_in',
      'engagement suppressed before opt-in',
    );

    const updated = await v1('/engagement/preferences', {
      token: tok,
      method: 'PUT',
      body: { engagementOptIn: true, channels: { email: true, sms: false, in_app: true } },
    });
    check(updated.json?.engagementOptIn === true, 'opt-in persisted');

    // --- Engagement now delivered, then de-duplicated --------------------------
    const first = await v1('/engagement/notifications/simulate', {
      token: tok,
      method: 'POST',
      body: engagementEvent('lot-1'),
    });
    check(
      first.json?.suppressed === false && first.json?.sent >= 1,
      `engagement delivered after opt-in (sent ${first.json?.sent})`,
    );
    const dupe = await v1('/engagement/notifications/simulate', {
      token: tok,
      method: 'POST',
      body: engagementEvent('lot-1'),
    });
    check(
      dupe.json?.suppressed === true && dupe.json?.reason === 'duplicate',
      're-emitted event is de-duplicated (idempotent)',
    );

    // --- Transactional is mandatory + in-app floor even with channels off ------
    await v1('/engagement/preferences', {
      token: tok,
      method: 'PUT',
      body: { channels: { in_app: false, push: false, email: false, sms: false, whatsapp: false } },
    });
    const txn = await v1('/engagement/notifications/simulate', {
      token: tok,
      method: 'POST',
      body: {
        eventType: 'PAYMENT_DUE',
        classification: 'transactional',
        subjectId: 'inv-1',
        title: 'Payment due',
        body: 'Settle your winning lot.',
      },
    });
    check(
      txn.json?.sent >= 1 && txn.json?.channels?.includes('in_app'),
      'transactional delivers on in-app floor with all channels off',
    );

    // --- Quiet hours hold engagement, transactional passes ---------------------
    await v1('/engagement/preferences', {
      token: tok,
      method: 'PUT',
      body: {
        channels: { in_app: true, email: true },
        quietHours: { start: '00:00', end: '23:59' },
        timezoneOffsetMinutes: 0,
      },
    });
    const quiet = await v1('/engagement/notifications/simulate', {
      token: tok,
      method: 'POST',
      body: engagementEvent('lot-quiet'),
    });
    check(quiet.json?.reason === 'quiet_hours', 'engagement held during quiet hours');
    const quietTxn = await v1('/engagement/notifications/simulate', {
      token: tok,
      method: 'POST',
      body: {
        eventType: 'WON',
        classification: 'transactional',
        subjectId: 'lot-won',
        title: 'You won',
        body: 'Congratulations.',
      },
    });
    check(quietTxn.json?.suppressed === false, 'transactional ignores quiet hours');

    // --- Frequency cap (fresh customer to isolate the window) ------------------
    const capId = await registerCustomer('eng-cap');
    const capTok = await token(['customer'], capId);
    await v1('/engagement/preferences', {
      token: capTok,
      method: 'PUT',
      body: {
        engagementOptIn: true,
        channels: { in_app: true },
        frequencyCapPerDay: 1,
        quietHours: null,
      },
    });
    const c1 = await v1('/engagement/notifications/simulate', {
      token: capTok,
      method: 'POST',
      body: engagementEvent('cap-a'),
    });
    const c2 = await v1('/engagement/notifications/simulate', {
      token: capTok,
      method: 'POST',
      body: engagementEvent('cap-b'),
    });
    check(
      c1.json?.sent >= 1 && c2.json?.reason === 'frequency_cap',
      'frequency cap: 2nd engagement in window is capped',
    );

    // --- Provider failure → retry → dead-letter --------------------------------
    const failId = await registerCustomer('eng-fail', `fail-${Date.now()}@ex.com`);
    const failTok = await token(['customer'], failId);
    await v1('/engagement/preferences', {
      token: failTok,
      method: 'PUT',
      body: { engagementOptIn: true, channels: { email: true, in_app: false }, quietHours: null },
    });
    const failSim = await v1('/engagement/notifications/simulate', {
      token: failTok,
      method: 'POST',
      body: engagementEvent('lot-fail'),
    });
    check(failSim.json?.sent === 0, 'a failing channel delivers nothing');
    const failLedger = await v1('/engagement/notifications', { token: failTok });
    const dead = (failLedger.json ?? []).find((d) => d.status === 'dead');
    check(!!dead, 'exhausted retries are dead-lettered in the delivery ledger');

    // --- Ledger reflects sent + suppressed for the first user ------------------
    const ledger = await v1('/engagement/notifications', { token: tok });
    check(
      Array.isArray(ledger.json) &&
        ledger.json.some((d) => d.status === 'sent') &&
        ledger.json.some((d) => d.status === 'suppressed'),
      'delivery ledger records both sent and suppressed outcomes',
    );

    // --- Preferences require auth ----------------------------------------------
    const anon = await v1('/engagement/preferences');
    check(
      anon.status === 401 || anon.status === 403,
      `preferences require auth (got ${anon.status})`,
    );
  } finally {
    await stop(child);
  }

  // --- Flag OFF: surface is 404 ------------------------------------------------
  child = await startApi({ FEATURE_V3_ENGAGEMENT: 'false' });
  try {
    const off = await v1('/engagement/preferences', {
      token: await token(['customer'], await registerCustomer('eng-off')),
    });
    check(off.status === 404, `engagement surface is 404 when the flag is OFF (got ${off.status})`);
  } finally {
    await stop(child);
  }

  if (failures > 0) {
    console.error(`\n${failures} engagement E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll engagement E2E checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
