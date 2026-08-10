import { Injectable } from '@nestjs/common';
import { type Actor, type DomainEventName, createEnvelope } from '@singha/contracts';
import { type Prisma } from '@singha/database';
import { type AuditEntryInput, recordAudit } from '@singha/domain';
import { newCorrelationId } from '@singha/observability';
import { PrismaService } from '../../prisma/prisma.service';

export interface EmitInput {
  name: DomainEventName;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export type AuditInput = Omit<AuditEntryInput, 'correlationId' | 'actorType' | 'actorId'> & {
  actorType?: AuditEntryInput['actorType'];
  actorId?: string | null;
};

export interface UowContext {
  tx: Prisma.TransactionClient;
  correlationId: string;
  emit(input: EmitInput): void;
  audit(input: AuditInput): void;
}

/**
 * Runs a unit of work in a single database transaction, persisting the business
 * change together with its domain events (transactional outbox) and audit
 * entries — atomically (docs/16). If the callback throws, nothing is written.
 */
@Injectable()
export class UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    actor: Actor,
    work: (ctx: UowContext) => Promise<T>,
    opts: { correlationId?: string; timeout?: number; maxWait?: number } = {},
  ): Promise<T> {
    const correlationId = opts.correlationId ?? newCorrelationId();
    const events: ReturnType<typeof createEnvelope>[] = [];
    const audits: ReturnType<typeof recordAudit>[] = [];

    return this.prisma.$transaction(
      async (tx) => {
        const ctx: UowContext = {
          tx,
          correlationId,
          emit: (input) => {
            events.push(createEnvelope({ ...input, actor, correlationId }));
          },
          audit: (input) => {
            audits.push(
              recordAudit({
                ...input,
                actorType: input.actorType ?? actor.type,
                actorId: input.actorId ?? actor.id,
                correlationId,
              }),
            );
          },
        };

        const result = await work(ctx);

        for (const event of events) {
          await tx.outboxEvent.create({
            data: {
              id: event.eventId,
              eventId: event.eventId,
              name: event.name,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              correlationId: event.correlationId,
              causationId: event.causationId ?? undefined,
              payload: event.payload as unknown as Prisma.InputJsonValue,
              payloadVersion: event.payloadVersion,
              occurredAt: new Date(event.occurredAt),
            },
          });
        }

        for (const entry of audits) {
          await tx.auditEvent.create({
            data: {
              id: entry.id,
              actorType: entry.actorType,
              actorId: entry.actorId ?? undefined,
              action: entry.action,
              targetType: entry.targetType,
              targetId: entry.targetId,
              correlationId: entry.correlationId,
              reason: entry.reason ?? undefined,
              before:
                entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
              after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
              occurredAt: new Date(entry.occurredAt),
            },
          });
        }

        return result;
      },
      { timeout: opts.timeout ?? 10000, maxWait: opts.maxWait ?? 10000 },
    );
  }
}
