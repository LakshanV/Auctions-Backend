import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type CreateCrmNoteInput,
  type CreateCrmTaskInput,
  type ListCrmNotesQuery,
  type ListCrmTasksQuery,
  Permission,
  type UpdateCrmTaskInput,
  createCrmNoteSchema,
  createCrmTaskSchema,
  listCrmNotesQuerySchema,
  listCrmTasksQuerySchema,
  updateCrmTaskSchema,
} from '@singha/contracts';
import { CrmService } from './crm.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody, ZodQuery } from '../../shared/validation/zod.pipe';

/**
 * Singha CRM staff-operations API (CRM completion pass). Notes + tasks/follow-ups. `crm:read`
 * reads, `crm:manage` writes — both staff-only (auction_staff / support / accounts / compliance /
 * admin). Notes are staff-internal and never returned to a customer surface.
 */
@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Post('notes')
  @RequirePermissions(Permission.CrmManage)
  addNote(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createCrmNoteSchema)) input: CreateCrmNoteInput,
  ) {
    return this.crm.addNote(principal, input);
  }

  @Get('notes')
  @RequirePermissions(Permission.CrmRead)
  listNotes(@Query(new ZodQuery(listCrmNotesQuerySchema)) query: ListCrmNotesQuery) {
    return this.crm.listNotes(query);
  }

  @Post('tasks')
  @RequirePermissions(Permission.CrmManage)
  createTask(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createCrmTaskSchema)) input: CreateCrmTaskInput,
  ) {
    return this.crm.createTask(principal, input);
  }

  @Get('tasks')
  @RequirePermissions(Permission.CrmRead)
  listTasks(@Query(new ZodQuery(listCrmTasksQuerySchema)) query: ListCrmTasksQuery) {
    return this.crm.listTasks(query);
  }

  @Get('tasks/:id')
  @RequirePermissions(Permission.CrmRead)
  getTask(@Param('id') id: string) {
    return this.crm.getTask(id);
  }

  @Patch('tasks/:id')
  @RequirePermissions(Permission.CrmManage)
  updateTask(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(updateCrmTaskSchema)) input: UpdateCrmTaskInput,
  ) {
    return this.crm.updateTask(principal, id, input);
  }
}
