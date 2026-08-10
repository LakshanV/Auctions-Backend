import { afterAll, describe, expect, it } from 'vitest';
import { newId } from '@singha/contracts';
import { PrismaClient } from '@prisma/client';

/**
 * Migration + upgrade-safety tests (docs/17 gate for Phase 1). Require a migrated
 * Postgres (DATABASE_URL) and otherwise skip. Exercised by `pnpm test:db`.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite('migrations & upgrade safety', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('added asset.attributes as a nullable, additive column', async () => {
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; is_nullable: string }>>(
      "select column_name, is_nullable from information_schema.columns where table_name = 'asset' and column_name = 'attributes'",
    );
    expect(cols).toHaveLength(1);
    expect(cols[0]?.is_nullable).toBe('YES');
  });

  it('accepts an asset created without attributes and retains its permanent id', async () => {
    // Models a "pre-migration" row: additive migrations must not break old data.
    const id = newId();
    await prisma.asset.create({ data: { id, category: 'general', lifecycle: 'available' } });
    const reloaded = await prisma.asset.findUnique({ where: { id } });
    expect(reloaded?.id).toBe(id);
    expect(reloaded?.attributes).toBeNull();
    expect(reloaded?.schemaVersion).toBe(1);
  });

  it('still enforces the append-only audit trigger after later migrations', async () => {
    const triggers = await prisma.$queryRawUnsafe<Array<{ tgname: string }>>(
      "select tgname from pg_trigger where tgname like 'audit_event_no_%' order by tgname",
    );
    expect(triggers.map((t) => t.tgname)).toEqual([
      'audit_event_no_delete',
      'audit_event_no_update',
    ]);
  });
});
