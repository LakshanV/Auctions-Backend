// Exit 0 iff the newest local Prisma migration is already recorded as applied in the DB.
//
// Used by scripts/start.sh as a safety fallback: when `prisma migrate deploy` cannot reach
// the SESSION pooler (:5432 is saturated during a redeploy — EMAXCONNSESSION), we still want
// the new replica to boot IF there is nothing to migrate, so it can pass its healthcheck,
// let Railway retire the old replica, and free the session pool. We must NOT boot when a real
// migration is pending. This check connects over the RUNTIME datasource (the :6543 transaction
// pooler via resolveRuntimeDatasourceUrl), which stays available even when :5432 is full.
//
// Exit codes: 0 = up to date (safe to boot) · 1 = pending migration (do NOT boot) · 2 = unknown.
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPrisma, disconnectPrisma } from '@singha/database';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'database', 'prisma', 'migrations');

function newestLocalMigration() {
  const names = readdirSync(migrationsDir)
    .filter((n) => {
      try {
        return statSync(join(migrationsDir, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort(); // timestamp-prefixed → lexicographic order is chronological
  return names.at(-1);
}

async function main() {
  const latest = newestLocalMigration();
  if (!latest) {
    console.error('[migrations-current] no local migrations found');
    process.exit(2);
  }

  const prisma = getPrisma();
  try {
    const rows = await prisma.$queryRaw`
      select 1 from "_prisma_migrations"
      where migration_name = ${latest} and finished_at is not null
      limit 1`;
    if (Array.isArray(rows) && rows.length > 0) {
      console.log(`[migrations-current] newest migration ${latest} already applied — safe to boot`);
      process.exit(0);
    }
    console.error(`[migrations-current] newest migration ${latest} NOT applied — a real migration is pending`);
    process.exit(1);
  } finally {
    await disconnectPrisma();
  }
}

main().catch((err) => {
  console.error('[migrations-current] check failed:', err?.message ?? err);
  process.exit(2);
});
