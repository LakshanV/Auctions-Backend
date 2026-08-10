import { type Actor, Role } from '@singha/contracts';
import { type Principal } from './principal';

const STAFF_ROLES: Role[] = [
  Role.SellerStaff,
  Role.AuctionStaff,
  Role.Accounts,
  Role.Support,
  Role.Compliance,
  Role.Admin,
  Role.SuperAdmin,
];

/** Map an authenticated Principal to an audit/event Actor (docs/15). */
export function toActor(principal: Principal): Actor {
  if (principal.roles.some((role) => STAFF_ROLES.includes(role))) {
    return { type: 'staff', id: principal.customerId };
  }
  if (principal.customerId) {
    return { type: 'customer', id: principal.customerId };
  }
  return { type: 'system', id: null };
}
