import { describe, expect, it } from 'vitest';
import { Role } from '@singha/contracts';
import { signPrincipal, verifyPrincipalToken } from './jwt';
import { makePrincipal } from './principal';
import { toActor } from './actor';

const secret = 'test-secret';

describe('jwt principal', () => {
  it('round-trips subject and roles', async () => {
    const token = await signPrincipal({ customerId: 'C1', roles: [Role.Seller] }, secret);
    const claims = await verifyPrincipalToken(token, secret);
    expect(claims.customerId).toBe('C1');
    expect(claims.roles).toEqual([Role.Seller]);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signPrincipal({ customerId: null, roles: [] }, secret);
    await expect(verifyPrincipalToken(token, 'wrong-secret')).rejects.toThrow();
  });

  it('drops unknown roles from a tampered/foreign token payload', async () => {
    const token = await signPrincipal({ customerId: 'C1', roles: ['not_a_role' as Role] }, secret);
    const claims = await verifyPrincipalToken(token, secret);
    expect(claims.roles).toEqual([]);
  });
});

describe('toActor', () => {
  it('maps staff roles to staff, customers to customer, and anon to system', () => {
    expect(toActor(makePrincipal('S1', [Role.AuctionStaff])).type).toBe('staff');
    expect(toActor(makePrincipal('C1', [Role.Customer])).type).toBe('customer');
    expect(toActor(makePrincipal(null, [])).type).toBe('system');
  });
});
