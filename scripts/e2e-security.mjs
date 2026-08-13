#!/usr/bin/env node
/**
 * Security-retrofit E2E (anti-clone pack doc 06). Boots the built API and proves
 * the HTTP hardening against a real server: security headers present + no server
 * fingerprint, explicit CORS allowlist (allowed echoed / disallowed not), errors
 * leak no stack/SQL/path, and route-aware rate limiting returns 429 on a burst
 * without harming normal use. The limiter is production-only, so this run opts in
 * with SECURITY_THROTTLE_TEST=1.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'http://localhost:4000';
const API = `${BASE}/api/v1`;
let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else {
    console.error('  ✗', msg);
    failures += 1;
  }
};

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

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SECURITY_THROTTLE_TEST: '1',
      CORS_ORIGINS: 'https://allowed.example.com',
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

    // --- Security headers + no fingerprint -----------------------------------
    const h = (await fetch(`${BASE}/healthz`)).headers;
    check(h.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
    const csp = h.get('content-security-policy') ?? '';
    check(
      (h.get('x-frame-options') ?? '').toUpperCase() === 'DENY' ||
        csp.includes("frame-ancestors 'none'"),
      'frame protection present',
    );
    check(
      h.get('referrer-policy') === 'no-referrer',
      `Referrer-Policy: no-referrer (${h.get('referrer-policy')})`,
    );
    check(!!csp, 'Content-Security-Policy present');
    check(!h.get('x-powered-by'), `no X-Powered-By (${h.get('x-powered-by')})`);

    // --- CORS allowlist ------------------------------------------------------
    const allowed = await fetch(`${BASE}/api/v2/catalogue?limit=1`, {
      headers: { origin: 'https://allowed.example.com' },
    });
    check(
      allowed.headers.get('access-control-allow-origin') === 'https://allowed.example.com',
      `allowed origin echoed (${allowed.headers.get('access-control-allow-origin')})`,
    );
    const denied = await fetch(`${BASE}/api/v2/catalogue?limit=1`, {
      headers: { origin: 'https://evil.example.com' },
    });
    check(
      denied.headers.get('access-control-allow-origin') !== 'https://evil.example.com',
      `disallowed origin not echoed (${denied.headers.get('access-control-allow-origin')})`,
    );

    // --- Error responses leak nothing ----------------------------------------
    const bad = await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', legalName: '' }),
    });
    const badText = JSON.stringify(await bad.json().catch(() => ({})));
    check(bad.status >= 400 && bad.status < 500, `invalid registration rejected (${bad.status})`);
    check(
      !/stack|node_modules|\/Users\/|at Object|Prisma|SELECT |\.ts:\d/i.test(badText),
      'error response leaks no stack / path / SQL / Prisma',
    );

    // --- Route-aware rate limiting -------------------------------------------
    const staff = (
      await (
        await fetch(`${API}/dev/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ roles: ['auction_staff'], aal: 'aal2' }),
        })
      ).json()
    ).token;
    check(!!staff, 'dev token issued in dev (prod-gated 404 verified live)');

    let ok = 0;
    let hit429 = false;
    for (let i = 0; i < 45; i += 1) {
      const r = await fetch(`${API}/members/search?q=zz`, {
        headers: { authorization: `Bearer ${staff}` },
      });
      if (r.status === 429) {
        hit429 = true;
        break;
      }
      if (r.status === 200) ok += 1;
    }
    check(
      ok >= 25 && hit429,
      `member search rate-limited after a burst (ok=${ok}, hit429=${hit429})`,
    );
  } finally {
    child.kill('SIGKILL');
  }

  if (failures > 0) {
    console.error(`\n${failures} security E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll security E2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
