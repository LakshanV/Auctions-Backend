import { Controller, Get } from '@nestjs/common';
import { MemberService } from './member.service';
import { CurrentActor } from '../../shared/auth/current-actor.decorator';
import { type Principal } from '../../shared/auth/principal';

/**
 * Customer self member area (Revision 05 §13/§21). A SEPARATE DTO from staff
 * Member 360 — internal score, flags, staff notes and investigations are never
 * projected here. Authorization is per-caller: you only ever see your own record
 * (the service rejects an unauthenticated caller).
 */
@Controller('me/member')
export class MemberSelfController {
  constructor(private readonly member: MemberService) {}

  @Get()
  self(@CurrentActor() principal: Principal) {
    return this.member.selfView(principal);
  }
}
