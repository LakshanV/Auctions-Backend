import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  Permission,
  approveCreditSchema,
  createMemberFlagSchema,
  grantTemporaryMembershipSchema,
  performanceContextValues,
  recordPerformanceEventSchema,
  releaseSecurityInstrumentSchema,
  resolveMemberFlagSchema,
  setMembershipStatusSchema,
  submitSecurityInstrumentSchema,
  suspendCreditSchema,
  verifySecurityInstrumentSchema,
} from '@singha/contracts';
import { z } from 'zod';
import { MemberService } from './member.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { RequirePermissions } from '../../shared/auth/require-permissions.decorator';
import { RequireAssurance } from '../../shared/auth/require-assurance.decorator';
import { ZodBody } from '../../shared/validation/zod.pipe';
import { type Principal } from '../../shared/auth/principal';

/**
 * Staff member/credit/security command surface (Revision 05 §12/§24). Explicit
 * commands only — never generic PATCH of sensitive state. Sensitive credit,
 * security, temporary-grant and membership actions additionally require AAL2
 * (server-enforced by AssuranceGuard); a hidden button is never the boundary.
 */
@Controller('members')
export class MemberController {
  constructor(private readonly member: MemberService) {}

  @Post('security')
  @RequirePermissions(Permission.SecurityRead)
  submitSecurity(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(submitSecurityInstrumentSchema)) body: unknown,
  ) {
    return this.member.submitSecurityInstrument(principal, body as never);
  }

  @Post('security/:id/verify')
  @RequirePermissions(Permission.SecurityVerify)
  @RequireAssurance()
  verifySecurity(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(verifySecurityInstrumentSchema)) body: unknown,
  ) {
    return this.member.verifySecurityInstrument(principal, id, body as never);
  }

  @Post('security/:id/release')
  @RequirePermissions(Permission.SecurityRelease)
  @RequireAssurance()
  releaseSecurity(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(releaseSecurityInstrumentSchema)) body: unknown,
  ) {
    return this.member.releaseSecurityInstrument(principal, id, body as never);
  }

  @Post('credit/approve')
  @RequirePermissions(Permission.CreditApprove)
  @RequireAssurance()
  approveCredit(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(approveCreditSchema)) body: unknown,
  ) {
    return this.member.approveCredit(principal, body as never);
  }

  @Post('credit/suspend')
  @RequirePermissions(Permission.CreditSuspend)
  @RequireAssurance()
  suspendCredit(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(suspendCreditSchema)) body: unknown,
  ) {
    return this.member.suspendCredit(principal, body as never);
  }

  @Post('membership/status')
  @RequirePermissions(Permission.MemberManage)
  @RequireAssurance()
  setMembershipStatus(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(setMembershipStatusSchema)) body: unknown,
  ) {
    return this.member.setMembershipStatus(principal, body as never);
  }

  @Post('temporary-grant')
  @RequirePermissions(Permission.MemberTemporaryGrant)
  @RequireAssurance()
  grantTemporary(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(grantTemporaryMembershipSchema)) body: unknown,
  ) {
    return this.member.grantTemporaryMembership(principal, body as never);
  }

  @Post('flags')
  @RequirePermissions(Permission.MemberFlagManage)
  createFlag(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(createMemberFlagSchema)) body: unknown,
  ) {
    return this.member.createMemberFlag(principal, body as never);
  }

  @Post('flags/:id/resolve')
  @RequirePermissions(Permission.MemberFlagManage)
  resolveFlag(
    @CurrentActor() principal: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(resolveMemberFlagSchema)) body: unknown,
  ) {
    return this.member.resolveMemberFlag(principal, id, body as never);
  }

  @Post('performance/events')
  @RequirePermissions(Permission.MemberManage)
  recordPerformance(
    @CurrentActor() principal: Principal,
    @Body(new ZodBody(recordPerformanceEventSchema)) body: unknown,
  ) {
    return this.member.recordPerformanceEvent(principal, body as never);
  }

  @Post('performance/recalculate')
  @RequirePermissions(Permission.MemberManage)
  recalcPerformance(
    @CurrentActor() principal: Principal,
    @Body(
      new ZodBody(
        z.object({ customerId: z.string().min(1), context: z.enum(performanceContextValues) }),
      ),
    )
    body: { customerId: string; context: 'buyer' | 'seller' },
  ) {
    return this.member.recalculatePerformance(principal, body.customerId, body.context);
  }

  // Public canonical credit policy (Rev 06.2 §8) — no member data, no auth.
  @Get('credit-policy')
  creditPolicy() {
    return this.member.creditPolicy();
  }

  // Staff-only, capped + audited: bulk member exfiltration is throttled hard (§04).
  @Get('search')
  @RequirePermissions(Permission.MemberRead)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  search(@CurrentActor() principal: Principal, @Query() query: Record<string, unknown>) {
    return this.member.search(principal, query);
  }

  @Get(':customerId/360')
  @RequirePermissions(Permission.MemberRead)
  member360(@CurrentActor() principal: Principal, @Param('customerId') customerId: string) {
    return this.member.member360(principal, customerId);
  }

  @Get('performance/:customerId')
  @RequirePermissions(Permission.PerformanceRead)
  performance(
    @Param('customerId') customerId: string,
    @Query('context') context: string | undefined,
    @CurrentActor() principal: Principal,
  ) {
    void principal;
    void context;
    return this.member.member360(principal, customerId).then((v) => v.performance);
  }
}
