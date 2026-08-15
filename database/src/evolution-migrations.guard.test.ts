import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Evolution E14 hardening guard — a permanent, automated compatibility check that every Singha
 * Evolution migration is **additive-only** (pack rule 10 + doc 14: no destructive production
 * migration; additive migrations roll back by feature-disable + forward-fix). It fails the build if
 * any evolution migration DROPs/RENAMEs/TRUNCATEs or ALTERs a column on an existing table. This is
 * the structural enforcement behind "existing tables untouched" claimed by E2–E13.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');

// Statements that would break additive-first compatibility. CREATE TABLE/INDEX/TYPE, ALTER TABLE ADD
// COLUMN, ADD CONSTRAINT and data-only UPDATE/INSERT backfills are all allowed.
const FORBIDDEN: { pattern: RegExp; label: string }[] = [
  { pattern: /\bDROP\s+TABLE\b/i, label: 'DROP TABLE' },
  { pattern: /\bDROP\s+COLUMN\b/i, label: 'DROP COLUMN' },
  { pattern: /\bDROP\s+CONSTRAINT\b/i, label: 'DROP CONSTRAINT' },
  { pattern: /\bDROP\s+INDEX\b/i, label: 'DROP INDEX' },
  { pattern: /\bDROP\s+NOT\s+NULL\b/i, label: 'DROP NOT NULL' },
  { pattern: /\bRENAME\b/i, label: 'RENAME' },
  { pattern: /\bTRUNCATE\b/i, label: 'TRUNCATE' },
  { pattern: /\bALTER\s+COLUMN\b/i, label: 'ALTER COLUMN' },
  { pattern: /\bALTER\s+TABLE\s+\w+\s+ALTER\b/i, label: 'ALTER TABLE ... ALTER' },
];

const ADDITIVE =
  /\b(CREATE\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|CREATE\s+TYPE|ADD\s+COLUMN|ADD\s+CONSTRAINT)\b/i;

function evolutionMigrations(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((d) => d.includes('evolution'))
    .sort();
}

describe('Singha Evolution migrations are additive-only (rule 10)', () => {
  const migrations = evolutionMigrations();

  it('finds the evolution migrations', () => {
    // E2..E13 each shipped at least one migration; guard against an empty/misresolved dir.
    expect(migrations.length).toBeGreaterThanOrEqual(10);
  });

  it.each(migrations)('%s contains no destructive statement', (dir) => {
    const sqlPath = join(MIGRATIONS_DIR, dir, 'migration.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    const hits = FORBIDDEN.filter((f) => f.pattern.test(sql)).map((f) => f.label);
    expect(hits, `${dir} must be additive-only but has: ${hits.join(', ')}`).toEqual([]);
  });

  it.each(migrations)('%s is additive (creates a table/index/column)', (dir) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8');
    expect(ADDITIVE.test(sql), `${dir} should add something`).toBe(true);
  });
});
