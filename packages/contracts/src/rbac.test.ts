import { describe, expect, it } from 'vitest';
import { Permission, Role, hasPermission, permissionsForRoles } from './rbac';

describe('rbac', () => {
  it('grants sellers listing creation but not review/publish', () => {
    expect(hasPermission([Role.Seller], Permission.ListingCreate)).toBe(true);
    expect(hasPermission([Role.Seller], Permission.ListingReview)).toBe(false);
    expect(hasPermission([Role.Seller], Permission.ListingPublish)).toBe(false);
  });

  it('grants auction staff review + publish', () => {
    expect(hasPermission([Role.AuctionStaff], Permission.ListingReview)).toBe(true);
    expect(hasPermission([Role.AuctionStaff], Permission.ListingPublish)).toBe(true);
  });

  it('gives admins every permission and customers only bidding', () => {
    expect(hasPermission([Role.Admin], Permission.KycManage)).toBe(true);
    expect(hasPermission([Role.Admin], Permission.AuditRead)).toBe(true);
    // A plain customer can bid but has no staff/seller privileges.
    expect(hasPermission([Role.Customer], Permission.BidPlace)).toBe(true);
    expect(hasPermission([Role.Customer], Permission.ListingCreate)).toBe(false);
    expect(permissionsForRoles([Role.Customer]).size).toBe(1);
  });

  it('unions permissions across multiple roles', () => {
    const perms = permissionsForRoles([Role.Seller, Role.Compliance]);
    expect(perms.has(Permission.ListingCreate)).toBe(true);
    expect(perms.has(Permission.KycManage)).toBe(true);
  });
});
