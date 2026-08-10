#!/usr/bin/env node
/**
 * Boot a throwaway PostgreSQL cluster (no Docker, no system services), run a
 * command with DATABASE_URL pointed at it, then tear everything down. Requires
 * `initdb`, `pg_ctl` and `createdb` on PATH (Homebrew postgresql@16 provides
 * these). Used for local verification of migrations + integration tests.
 *
 * Usage: node scripts/with-ephemeral-db.mjs <command> [args...]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv.slice(2);
if (command.length === 0) {
  console.error('Usage: node scripts/with-ephemeral-db.mjs <command> [args...]');
  process.exit(1);
}

const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
const dataDir = join(repoRoot, '.localdb', `pg-${stamp}`);
const port = 55000 + Math.floor(Math.random() * 5000);
const user = 'singha';
const dbName = 'singha_v2';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function pgStop() {
  spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'immediate'], { stdio: 'ignore' });
}

// Postgres passes the -o string to the server split on spaces, so the socket
// dir must be space-free — the repo path ("Auctions New") is not. Use a temp dir.
const socketDir = mkdtempSync(join(tmpdir(), 'singha-pg-'));

let exitCode = 1;
try {
  mkdirSync(dataDir, { recursive: true });

  console.log(`[ephemeral-db] initdb (${dataDir})`);
  if (run('initdb', ['-D', dataDir, '-U', user, '--auth=trust', '-E', 'UTF8']) !== 0) {
    throw new Error('initdb failed');
  }

  console.log(`[ephemeral-db] starting postgres on 127.0.0.1:${port}`);
  const startStatus = run('pg_ctl', [
    '-D',
    dataDir,
    '-o',
    `-p ${port} -h 127.0.0.1 -k ${socketDir}`,
    '-w',
    '-l',
    join(dataDir, 'server.log'),
    'start',
  ]);
  if (startStatus !== 0) throw new Error('pg_ctl start failed');

  run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', user, dbName]);

  const databaseUrl = `postgresql://${user}@127.0.0.1:${port}/${dbName}?schema=public`;
  console.log(`[ephemeral-db] running: ${command.join(' ')}`);
  exitCode = run(command[0], command.slice(1), {
    // DIRECT_URL mirrors DATABASE_URL — Prisma's schema requires it (Supabase).
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    shell: false,
  });
} catch (error) {
  console.error('[ephemeral-db] error:', error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  console.log('[ephemeral-db] stopping + cleaning up');
  pgStop();
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  if (existsSync(socketDir)) rmSync(socketDir, { recursive: true, force: true });
}

process.exit(exitCode);
