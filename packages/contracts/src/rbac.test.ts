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

  it('RW5 — sellers may manage their OWN offers (exchange:operate-own) but never the broad operator grant', () => {
    // A seller can reach the owner-scoped offer routes...
    expect(hasPermission([Role.Seller], Permission.ExchangeOperateOwn)).toBe(true);
    expect(hasPermission([Role.SellerStaff], Permission.ExchangeOperateOwn)).toBe(true);
    // ...but is NOT a general exchange operator (the service still checks listing ownership).
    expect(hasPermission([Role.Seller], Permission.ExchangeOperate)).toBe(false);
    // Operators hold both (they manage any listing's offers).
    expect(hasPermission([Role.AuctionStaff], Permission.ExchangeOperate)).toBe(true);
    expect(hasPermission([Role.AuctionStaff], Permission.ExchangeOperateOwn)).toBe(true);
    // A plain customer/buyer holds neither.
    expect(hasPermission([Role.Customer], Permission.ExchangeOperateOwn)).toBe(false);
    expect(hasPermission([Role.Customer], Permission.ExchangeOperate)).toBe(false);
  });

  it('gives admins every permission and customers only bidding', () => {
    expect(hasPermission([Role.Admin], Permission.KycManage)).toBe(true);
    expect(hasPermission([Role.Admin], Permission.AuditRead)).toBe(true);
    // A plain customer can bid, submit an EOI and participate in the exchange
    // (buy-now / offer / tender), but has no staff/seller privileges.
    expect(hasPermission([Role.Customer], Permission.BidPlace)).toBe(true);
    expect(hasPermission([Role.Customer], Permission.EoiSubmit)).toBe(true);
    expect(hasPermission([Role.Customer], Permission.ExchangeParticipate)).toBe(true);
    expect(hasPermission([Role.Customer], Permission.CommercePay)).toBe(true);
    expect(hasPermission([Role.Customer], Permission.WatchManage)).toBe(true);
    // AIC-1: every customer can converse with the non-binding AI assistant.
    expect(hasPermission([Role.Customer], Permission.AiConverse)).toBe(true);
    expect(hasPermission([Role.Customer], Permission.ListingCreate)).toBe(false);
    expect(permissionsForRoles([Role.Customer]).size).toBe(6);
  });

  it('unions permissions across multiple roles', () => {
    const perms = permissionsForRoles([Role.Seller, Role.Compliance]);
    expect(perms.has(Permission.ListingCreate)).toBe(true);
    expect(perms.has(Permission.KycManage)).toBe(true);
  });
});
