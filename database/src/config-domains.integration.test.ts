import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { newId } from '@singha/contracts';

/**
 * Evolution E2 config foundations — real-Postgres integration (runs under the ephemeral-DB
 * harness via `pnpm test:db`; skipped when no DATABASE_URL). Verifies the additive migration
 * applied, the config graph persists with its relations, and the owner-gated / Addendum-A
 * defaults hold. It does not depend on the seed (test:db migrates but does not seed).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite('Evolution E2 config domains (integration)', () => {
  const prisma = new PrismaClient();
  const marketId = newId();
  const operatorId = newId();
  const nodeId = newId();
  const code = marketId.toLowerCase();

  afterAll(async () => {
    await prisma.marketNodeOperator.deleteMany({ where: { nodeId } });
    await prisma.operatorMarket.deleteMany({ where: { operatorId } });
    await prisma.marketNode.deleteMany({ where: { id: nodeId } });
    await prisma.operator.deleteMany({ where: { id: operatorId } });
    await prisma.market.deleteMany({ where: { id: marketId } });
    await prisma.$disconnect();
  });

  it('migrated all E2 config tables (queryable)', async () => {
    await Promise.all([
      prisma.market.findMany({ take: 1 }),
      prisma.operator.findMany({ take: 1 }),
      prisma.marketNode.findMany({ take: 1 }),
      prisma.operatorMarket.findMany({ take: 1 }),
      prisma.marketNodeOperator.findMany({ take: 1 }),
      prisma.location.findMany({ take: 1 }),
      prisma.saleMethodDefinition.findMany({ take: 1 }),
      prisma.unitDefinition.findMany({ take: 1 }),
    ]);
    expect(true).toBe(true);
  });

  it('persists a market → operator → node graph with relations + owner-gated defaults', async () => {
    await prisma.market.create({
      data: {
        id: marketId,
        code: `e2e-mkt-${code}`,
        name: 'Test Market',
        countryCode: 'LK',
        defaultCurrency: 'LKR',
      },
    });
    const operator = await prisma.operator.create({
      data: { id: operatorId, code: `e2e-op-${code}`, publicName: 'Test Operator' },
    });
    // D7: owner/legal-gated identity ships `draft` (not verified) by default.
    expect(operator.verification).toBe('draft');
    expect(operator.legalName).toBeNull();

    await prisma.operatorMarket.create({ data: { id: newId(), operatorId, marketId } });
    const node = await prisma.marketNode.create({
      data: { id: nodeId, code: `e2e-node-${code}`, name: 'Test Node', primaryMarketId: marketId },
    });
    // Addendum A: a node defaults to Discovery mode with every local-commerce capability off.
    expect(node.mode).toBe('DISCOVERY');
    expect(node.canOriginateListings).toBe(false);
    expect(node.canAcceptPayments).toBe(false);
    await prisma.marketNodeOperator.create({ data: { id: newId(), nodeId, operatorId } });

    const readBack = await prisma.marketNode.findUnique({
      where: { id: nodeId },
      include: { primaryMarket: true, operators: true },
    });
    expect(readBack?.primaryMarket?.code).toBe(`e2e-mkt-${code}`);
    expect(readBack?.operators).toHaveLength(1);
  });

  it('enforces the unique operator code constraint', async () => {
    await expect(
      prisma.operator.create({
        data: { id: newId(), code: `e2e-op-${code}`, publicName: 'Duplicate' },
      }),
    ).rejects.toThrow();
  });
});
