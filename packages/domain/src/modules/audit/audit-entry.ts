import { type AuditEventId, newId } from '@singha/contracts';
import { type Clock, systemClock } from '../../kernel/clock';

/**
 * Audit module (docs/04, docs/15). Audit is APPEND-ONLY business evidence:
 * actor, action, target, timestamp, correlation, reason and before/after.
 * "Normal admins cannot delete audit history" — enforced at the database layer
 * (revoked DELETE/UPDATE). In memory, entries are frozen to prevent mutation.
 */
export type ActorType = 'customer' | 'staff' | 'system' | 'ai';

export interface AuditEntryInput {
  actorType: ActorType;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  correlationId: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditEntry extends Readonly<AuditEntryInput> {
  readonly id: AuditEventId;
  readonly occurredAt: string;
}

export function recordAudit(input: AuditEntryInput, clock: Clock = systemClock): AuditEntry {
  const entry: AuditEntry = {
    id: newId<'AuditEventId'>(),
    occurredAt: clock.now().toISOString(),
    ...input,
  };
  return Object.freeze(entry);
}
