import { afterAll, describe, expect, it } from 'vitest';
import { createEnvelope, DomainEventName, newId } from '@singha/contracts';
import { PrismaClient, type Prisma } from '@prisma/client';

/**
 * Integration tests for the Phase 0 data core. They require a migrated Postgres
 * (DATABASE_URL set) and otherwise SKIP — so `pnpm test` stays green in
 * environments without a database (docs/17 allows mocks/skips until infra).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite('data core (integration)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has the Phase 0 tables migrated', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toContain('customer');
    expect(names).toContain('asset');
    expect(names).toContain('listing');
    expect(names).toContain('audit_event');
    expect(names).toContain('outbox_event');
    expect(names).toContain('feature_flag');
  });

  it('lets one asset back multiple listings without a new identity (docs/04)', async () => {
    const customerId = newId();
    await prisma.customer.create({ data: { id: customerId, status: 'active' } });

    const assetId = newId();
    await prisma.asset.create({
      data: {
        id: assetId,
        category: 'vehicles',
        ownerCustomerId: customerId,
        lifecycle: 'available',
      },
    });

    const l1 = await prisma.listing.create({
      data: { id: newId(), assetId, saleMethod: 'TIMED_AUCTION', publicRef: `REF-${newId()}` },
    });
    const l2 = await prisma.listing.create({
      data: {
        id: newId(),
        assetId,
        saleMethod: 'EXPRESSION_OF_INTEREST',
        publicRef: `REF-${newId()}`,
      },
    });

    expect(l1.assetId).toBe(assetId);
    expect(l2.assetId).toBe(assetId);
    expect(l1.id).not.toBe(l2.id);
  });

  it('enforces append-only audit at the database (update & delete rejected)', async () => {
    const id = newId();
    await prisma.auditEvent.create({
      data: {
        id,
        actorType: 'staff',
        actorId: 'S1',
        action: 'RESERVE_CHANGED',
        targetType: 'Auction',
        targetId: 'A1',
        correlationId: 'corr-1',
      },
    });

    await expect(
      prisma.auditEvent.update({ where: { id }, data: { action: 'TAMPER' } }),
    ).rejects.toThrow();
    await expect(prisma.auditEvent.delete({ where: { id } })).rejects.toThrow();

    const persisted = await prisma.auditEvent.findUnique({ where: { id } });
    expect(persisted?.action).toBe('RESERVE_CHANGED');
  });

  it('persists a domain event to the transactional outbox as pending', async () => {
    const envelope = createEnvelope({
      name: DomainEventName.AuctionClosed,
      aggregateType: 'Auction',
      aggregateId: 'A1',
      actor: { type: 'system', id: null },
      payload: { hammer: 250000 },
    });

    await prisma.outboxEvent.create({
      data: {
        id: envelope.eventId,
        eventId: envelope.eventId,
        name: envelope.name,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        correlationId: envelope.correlationId,
        causationId: envelope.causationId,
        payload: envelope.payload as unknown as Prisma.InputJsonValue,
        payloadVersion: envelope.payloadVersion,
        occurredAt: new Date(envelope.occurredAt),
      },
    });

    const row = await prisma.outboxEvent.findUnique({ where: { eventId: envelope.eventId } });
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(0);
  });
});
