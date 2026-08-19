#!/usr/bin/env node
/**
 * Singha CRM (staff operations) E2E — internal notes + tasks/follow-ups (CRM completion pass).
 * Proves: RBAC (crm:manage write / crm:read read / customer refused), polymorphic task links +
 * link-required validation, status lifecycle with completion stamping, the overdue filter, and
 * the append-only crm_note DB guarantee. Boots the built API against DATABASE_URL.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import PrismaPkg from '@prisma/client';

const { PrismaClient } = PrismaPkg;
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
const patch = (p, o) => req('PATCH', p, o);
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

async function main() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
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

    const staff = await token(['auction_staff']);
    const customer = await token(['customer'], 'crm-cust-tokenholder');
    const cust = await post('/customers', {
      body: { legalName: '[SIM] CRM Customer', email: `crm-${Date.now()}@sim.local` },
    });
    const customerId = cust.json.id;

    // ── Notes ────────────────────────────────────────────────────────────────
    const note = await post('/crm/notes', {
      token: staff,
      body: {
        subjectType: 'customer',
        subjectId: customerId,
        body: 'High-value bidder — call before next sale.',
      },
    });
    check(note.status === 201 && note.json?.id, `staff adds a note (${note.status})`);
    const noteId = note.json?.id;
    const noteList = await get(`/crm/notes?subjectType=customer&subjectId=${customerId}`, {
      token: staff,
    });
    check(
      Array.isArray(noteList.json) && noteList.json.some((n) => n.id === noteId),
      'note appears in the subject note list',
    );
    const custNote = await post('/crm/notes', {
      token: customer,
      body: { subjectType: 'customer', subjectId: customerId, body: 'x' },
    });
    check(
      custNote.status === 403,
      `customer cannot add a CRM note -> 403 (got ${custNote.status})`,
    );

    // Append-only DB guarantee.
    let noteImmutable = false;
    try {
      await prisma.crmNote.update({ where: { id: noteId }, data: { body: 'tampered' } });
    } catch {
      noteImmutable = true;
    }
    check(noteImmutable, 'crm_note UPDATE rejected at the DB (append-only)');
    let noteNoDelete = false;
    try {
      await prisma.crmNote.delete({ where: { id: noteId } });
    } catch {
      noteNoDelete = true;
    }
    check(noteNoDelete, 'crm_note DELETE rejected at the DB (append-only)');

    // ── Tasks ────────────────────────────────────────────────────────────────
    const task = await post('/crm/tasks', {
      token: staff,
      body: { title: 'Call high-value bidder', type: 'call', priority: 'high', customerId },
    });
    check(
      task.status === 201 && task.json?.status === 'open',
      `staff creates a task (${task.status})`,
    );
    const taskId = task.json?.id;

    const noLink = await post('/crm/tasks', { token: staff, body: { title: 'orphan task' } });
    check(noLink.status === 400, `task with no subject link -> 400 (got ${noLink.status})`);

    const custTask = await post('/crm/tasks', {
      token: customer,
      body: { title: 'x', customerId },
    });
    check(custTask.status === 403, `customer cannot create a task -> 403 (got ${custTask.status})`);

    const byCustomer = await get(`/crm/tasks?customerId=${customerId}`, { token: staff });
    check(
      Array.isArray(byCustomer.json) && byCustomer.json.some((t) => t.id === taskId),
      'task lists under its customer filter',
    );

    const progress = await patch(`/crm/tasks/${taskId}`, {
      token: staff,
      body: { status: 'in_progress' },
    });
    check(progress.json?.status === 'in_progress', 'task advances to in_progress');
    const done = await patch(`/crm/tasks/${taskId}`, {
      token: staff,
      body: { status: 'done', result: 'Called, will bid on lot 12.' },
    });
    check(
      done.json?.status === 'done' && done.json?.completedAt && done.json?.completedBy,
      'closing a task stamps completedAt + completedBy',
    );

    // Overdue filter.
    const overdueTask = await post('/crm/tasks', {
      token: staff,
      body: {
        title: 'Follow up unsold asset',
        type: 'follow_up',
        customerId,
        dueAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    });
    const overdue = await get('/crm/tasks?overdue=true', { token: staff });
    check(
      Array.isArray(overdue.json) && overdue.json.some((t) => t.id === overdueTask.json?.id),
      'overdue filter surfaces a past-due open task',
    );

    // A sensitive (financial) task closes fine for a human (the AI-close block is structural — AI
    // is never a JWT principal on this authed route).
    const sensitive = await post('/crm/tasks', {
      token: staff,
      body: {
        title: 'Payment action required',
        type: 'payment_action',
        customerId,
        sensitive: true,
      },
    });
    const sensitiveClose = await patch(`/crm/tasks/${sensitive.json?.id}`, {
      token: staff,
      body: { status: 'done', result: 'Refund issued.' },
    });
    check(sensitiveClose.json?.status === 'done', 'a human can close a sensitive task');

    // ── Staff Customer 360 — transactional history (§3) ────────────────────────
    const history = await get(`/crm/customers/${customerId}/history`, { token: staff });
    check(
      history.status === 200 &&
        history.json?.customer?.id === customerId &&
        history.json?.summary &&
        typeof history.json.summary.openInvoices === 'number',
      `staff reads a customer's transactional history (${history.status})`,
    );
    const custHistory = await get(`/crm/customers/${customerId}/history`, { token: customer });
    check(
      custHistory.status === 403,
      `customer cannot read CRM history -> 403 (${custHistory.status})`,
    );

    // ── Staff Customer 360 — unified timeline (§18) ────────────────────────────
    const timeline = await get(`/crm/customers/${customerId}/timeline`, { token: staff });
    const kinds = Array.isArray(timeline.json?.entries)
      ? timeline.json.entries.map((e) => e.kind)
      : [];
    check(
      timeline.status === 200 && kinds.includes('note') && kinds.includes('task'),
      'timeline merges the customer note + tasks chronologically',
    );
    // Descending chronological order (newest first).
    const ordered =
      Array.isArray(timeline.json?.entries) &&
      timeline.json.entries.every((e, i, a) => i === 0 || a[i - 1].at >= e.at);
    check(ordered, 'timeline entries are newest-first');
    const custTimeline = await get(`/crm/customers/${customerId}/timeline`, { token: customer });
    check(
      custTimeline.status === 403,
      `customer cannot read CRM timeline -> 403 (${custTimeline.status})`,
    );

    // ── Member 360 fold: contact + channels + CRM strip (§3/§19) ───────────────
    const m360 = await get(`/members/${customerId}/360`, { token: staff });
    check(
      m360.status === 200 && m360.json?.contact && 'email' in m360.json.contact,
      `member 360 exposes contact to staff (${m360.status})`,
    );
    check(Array.isArray(m360.json?.channels), 'member 360 includes channel identities array');
    check(
      m360.json?.crm &&
        Array.isArray(m360.json.crm.openTasks) &&
        Array.isArray(m360.json.crm.recentNotes),
      'member 360 folds in the CRM strip (open tasks + recent notes)',
    );
    check(
      (m360.json?.crm?.recentNotes ?? []).some((n) => n.id === noteId),
      'the internal note appears in the 360 CRM strip',
    );
    check(
      (m360.json?.crm?.openTasks ?? []).every(
        (t) => t.status !== 'done' && t.status !== 'cancelled',
      ),
      'the 360 CRM strip lists only OPEN tasks (closed ones excluded)',
    );
    // A customer must never reach the staff 360.
    const custM360 = await get(`/members/${customerId}/360`, { token: customer });
    check(
      custM360.status === 403,
      `customer cannot read the staff member 360 -> 403 (${custM360.status})`,
    );

    await prisma.$disconnect();
    if (failures > 0) {
      console.error(`\n${failures} CRM E2E check(s) failed.`);
      process.exit(1);
    }
    console.log('\nAll CRM E2E checks passed.');
  } finally {
    child.kill('SIGKILL');
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
