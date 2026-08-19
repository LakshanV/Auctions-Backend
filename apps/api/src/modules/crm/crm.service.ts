import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateCrmNoteInput,
  type CreateCrmTaskInput,
  type ListCrmNotesQuery,
  type ListCrmTasksQuery,
  type UpdateCrmTaskInput,
  newId,
} from '@singha/contracts';
import { type CrmNote, type CrmTask, type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitOfWork } from '../../shared/persistence/unit-of-work';
import { toActor } from '../../shared/auth/actor';
import { type Principal } from '../../shared/auth/principal';

/**
 * Singha CRM (staff operations) — authoritative, Singha-native (CRM completion pass §5/§19).
 * Notes are append-only (DB trigger-enforced) and staff-internal; tasks are polymorphic
 * follow-ups linked to any authoritative record. AI may SUGGEST a task (source=ai_suggested) but
 * never closes one — a sensitive (compliance/financial) task requires an explicit human close.
 * Every write is audited through the UnitOfWork; nothing here duplicates a customer master.
 */
@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
  ) {}

  // ── Internal notes (append-only) ────────────────────────────────────────────
  async addNote(principal: Principal, input: CreateCrmNoteInput) {
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const note = await ctx.tx.crmNote.create({
        data: {
          id,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          body: input.body,
          visibility: input.visibility,
          authorId: actor.id ?? 'staff',
        },
      });
      ctx.audit({
        action: 'CRM_NOTE_ADDED',
        targetType: 'CrmNote',
        targetId: id,
        after: { subjectType: input.subjectType, subjectId: input.subjectId },
      });
      return this.noteView(note);
    });
  }

  async listNotes(query: ListCrmNotesQuery) {
    const notes = await this.prisma.crmNote.findMany({
      where: { subjectType: query.subjectType, subjectId: query.subjectId },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return notes.map((n) => this.noteView(n));
  }

  private noteView(n: CrmNote) {
    return {
      id: n.id,
      subjectType: n.subjectType,
      subjectId: n.subjectId,
      body: n.body,
      visibility: n.visibility,
      authorId: n.authorId,
      createdAt: n.createdAt,
    };
  }

  // ── Tasks / follow-ups ──────────────────────────────────────────────────────
  async createTask(principal: Principal, input: CreateCrmTaskInput) {
    const actor = toActor(principal);
    const id = newId();
    return this.uow.execute(actor, async (ctx) => {
      const task = await ctx.tx.crmTask.create({
        data: {
          id,
          title: input.title,
          description: input.description,
          type: input.type,
          priority: input.priority,
          customerId: input.customerId,
          organizationId: input.organizationId,
          listingId: input.listingId,
          auctionId: input.auctionId,
          saleId: input.saleId,
          conversationId: input.conversationId,
          shipmentId: input.shipmentId,
          assigneeId: input.assigneeId,
          team: input.team,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          remindAt: input.remindAt ? new Date(input.remindAt) : undefined,
          source: input.source,
          sensitive: input.sensitive,
          createdBy: actor.id ?? 'staff',
        },
      });
      ctx.audit({
        action: 'CRM_TASK_CREATED',
        targetType: 'CrmTask',
        targetId: id,
        after: { type: input.type, title: input.title, sensitive: input.sensitive },
      });
      return this.taskView(task);
    });
  }

  async getTask(id: string) {
    const task = await this.prisma.crmTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return this.taskView(task);
  }

  async listTasks(query: ListCrmTasksQuery) {
    const where: Prisma.CrmTaskWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.type) where.type = query.type;
    if (query.overdue === 'true') {
      where.dueAt = { lt: new Date() };
      where.status = { in: ['open', 'in_progress', 'blocked'] };
    }
    const tasks = await this.prisma.crmTask.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: query.limit,
    });
    return tasks.map((t) => this.taskView(t));
  }

  async updateTask(principal: Principal, id: string, input: UpdateCrmTaskInput) {
    const task = await this.prisma.crmTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    const actor = toActor(principal);

    // §5 safety: a sensitive (compliance / financial) task may only be closed by a HUMAN — AI may
    // suggest and progress work but must never silently complete or cancel it. AI is never a JWT
    // principal (so actor.type is never 'ai' on this authenticated route); assert defensively.
    const closing = input.status === 'done' || input.status === 'cancelled';
    if (closing && task.sensitive && actor.type === 'ai') {
      throw new ForbiddenException('A sensitive task must be closed by a human');
    }

    const data: Prisma.CrmTaskUpdateInput = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
    if (input.team !== undefined) data.team = input.team;
    if (input.dueAt !== undefined) data.dueAt = input.dueAt === null ? null : new Date(input.dueAt);
    if (input.remindAt !== undefined) {
      data.remindAt = input.remindAt === null ? null : new Date(input.remindAt);
    }
    if (input.result !== undefined) data.result = input.result;
    if (closing) {
      data.completedBy = actor.id ?? 'staff';
      data.completedAt = new Date();
    }

    return this.uow.execute(actor, async (ctx) => {
      const updated = await ctx.tx.crmTask.update({ where: { id }, data });
      ctx.audit({
        action: 'CRM_TASK_UPDATED',
        targetType: 'CrmTask',
        targetId: id,
        before: { status: task.status },
        after: { status: updated.status },
      });
      return this.taskView(updated);
    });
  }

  private taskView(t: CrmTask) {
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      type: t.type,
      priority: t.priority,
      status: t.status,
      customerId: t.customerId,
      organizationId: t.organizationId,
      listingId: t.listingId,
      auctionId: t.auctionId,
      saleId: t.saleId,
      conversationId: t.conversationId,
      shipmentId: t.shipmentId,
      assigneeId: t.assigneeId,
      team: t.team,
      dueAt: t.dueAt,
      remindAt: t.remindAt,
      source: t.source,
      sensitive: t.sensitive,
      result: t.result,
      createdBy: t.createdBy,
      completedBy: t.completedBy,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
