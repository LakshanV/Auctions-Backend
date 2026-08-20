import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  type AwardProcurementInput,
  type CreateProcurementRequestInput,
  Permission,
  type ProcurementRequestsQuery,
  type SubmitProcurementProposalInput,
  awardProcurementSchema,
  createProcurementRequestSchema,
  procurementRequestsQuerySchema,
  submitProcurementProposalSchema,
} from '@singha/contracts';
import { ProcurementService } from './procurement.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { type Principal } from '../../shared/auth/principal';
import { ZodBody, ZodQuery } from '../../shared/validation/zod.pipe';

/**
 * Procurement API (Evolution E9, pack doc 09). Flag-gated (`procurement`) in the service.
 * `exchange:participate` — buyers post/close/award requests (ownership enforced), suppliers submit
 * proposals. A procurement award is buyer-explicit; matching never auto-awards.
 *
 * Creating and listing requests both carry an EXPLICIT acting context (`personal` by default, or
 * `organization` + `organizationId`). The organization is authorized server-side before anything is
 * written or read, and the personal and organization books stay disjoint.
 */
@Controller('procurement')
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  @Post('requests')
  @RequirePermissions(Permission.ExchangeParticipate)
  create(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createProcurementRequestSchema)) input: CreateProcurementRequestInput,
  ) {
    return this.procurement.createRequest(principal, input);
  }

  @Get('requests/mine')
  mine(
    @CurrentActor() principal: Principal,
    @Query(new ZodQuery(procurementRequestsQuerySchema)) query: ProcurementRequestsQuery,
  ) {
    return this.procurement.myRequests(principal, query);
  }

  @Post('requests/:id/proposals')
  @RequirePermissions(Permission.ExchangeParticipate)
  submit(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(submitProcurementProposalSchema)) input: SubmitProcurementProposalInput,
  ) {
    return this.procurement.submitProposal(principal, id, input);
  }

  @Get('requests/:id/proposals')
  @RequirePermissions(Permission.ExchangeParticipate)
  proposals(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.procurement.proposalsForRequest(principal, id);
  }

  @Post('requests/:id/close')
  @RequirePermissions(Permission.ExchangeParticipate)
  close(@CurrentActor() principal: Principal, @Param('id') id: string) {
    return this.procurement.closeRequest(principal, id);
  }

  @Post('requests/:id/award')
  @RequirePermissions(Permission.ExchangeParticipate)
  award(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(awardProcurementSchema)) input: AwardProcurementInput,
  ) {
    return this.procurement.award(principal, id, input);
  }
}
