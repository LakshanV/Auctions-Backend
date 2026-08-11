import { describe, expect, it } from 'vitest';
import { Role } from '@singha/contracts';
import { signPrincipal, verifyPrincipalToken } from './jwt';
import { makePrincipal } from './principal';
import { canManageAssetMedia } from './asset-authz';

const secret = 'test-secret-for-security-spec';

describe('canManageAssetMedia (pack FIX-03 object authz)', () => {
  const asset = (ownerCustomerId: string | null) => ({ ownerCustomerId });

  it('allows the seller who owns the asset', () => {
    const seller = makePrincipal('C-owner', [Role.Seller]);
    expect(canManageAssetMedia(seller, asset('C-owner'))).toBe(true);
  });

  it('denies a different seller (cross-seller IDOR)', () => {
    const other = makePrincipal('C-other', [Role.Seller]);
    expect(canManageAssetMedia(other, asset('C-owner'))).toBe(false);
  });

  it('denies a plain customer who does not own the asset', () => {
    const customer = makePrincipal('C-buyer', [Role.Customer]);
    expect(canManageAssetMedia(customer, asset('C-owner'))).toBe(false);
  });

  it('allows platform staff holding asset:manage on any asset', () => {
    const staff = makePrincipal('S-1', [Role.AuctionStaff]);
    expect(canManageAssetMedia(staff, asset('C-owner'))).toBe(true);
    expect(canManageAssetMedia(makePrincipal('A-1', [Role.Admin]), asset(null))).toBe(true);
  });

  it('denies an anonymous principal', () => {
    const anon = makePrincipal(null, []);
    expect(canManageAssetMedia(anon, asset('C-owner'))).toBe(false);
  });
});

describe('jwt assurance level (pack FIX-08)', () => {
  it('round-trips aal2', async () => {
    const token = await signPrincipal(
      { customerId: 'C1', roles: [Role.AuctionStaff], aal: 'aal2' },
      secret,
    );
    expect((await verifyPrincipalToken(token, secret)).aal).toBe('aal2');
  });

  it('defaults to aal1 when the token omits aal', async () => {
    const token = await signPrincipal({ customerId: 'C1', roles: [Role.Customer] }, secret);
    expect((await verifyPrincipalToken(token, secret)).aal).toBe('aal1');
  });

  it('makePrincipal defaults to aal1', () => {
    expect(makePrincipal('C1', [Role.Customer]).aal).toBe('aal1');
  });
});
