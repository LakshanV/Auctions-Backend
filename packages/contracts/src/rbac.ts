/**
 * Role-based access control (docs/15). Authorization is enforced on the SERVER.
 * Roles map to a least-privilege set of permission strings; admin/super-admin
 * are granted every permission. Ownership ("act on your own record") is checked
 * separately in services, not encoded as a global permission.
 */
export const Role = {
  Customer: 'customer',
  Seller: 'seller',
  SellerStaff: 'seller_staff',
  AuctionStaff: 'auction_staff',
  Accounts: 'accounts',
  Support: 'support',
  Compliance: 'compliance',
  Admin: 'admin',
  SuperAdmin: 'super_admin',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ALL_ROLES = Object.values(Role) as [Role, ...Role[]];

export const Permission = {
  CustomerRead: 'customer:read',
  CustomerManage: 'customer:manage',
  KycManage: 'kyc:manage',
  OrganizationCreate: 'organization:create',
  OrganizationManage: 'organization:manage',
  AssetCreate: 'asset:create',
  AssetManage: 'asset:manage',
  ListingCreate: 'listing:create',
  ListingSubmit: 'listing:submit',
  ListingReview: 'listing:review',
  ListingPublish: 'listing:publish',
  MediaManage: 'media:manage',
  AuctionConfigure: 'auction:configure',
  AuctionOperate: 'auction:operate',
  BidPlace: 'bid:place',
  EoiSubmit: 'eoi:submit',
  EoiReview: 'eoi:review',
  ExchangeParticipate: 'exchange:participate',
  ExchangeOperate: 'exchange:operate',
  CommercePay: 'commerce:pay',
  CommerceOperate: 'commerce:operate',
  ConnectOperate: 'connect:operate',
  AiUse: 'ai:use',
  SocialOperate: 'social:operate',
  // Approving a publication is a distinct human gate from drafting/operating it
  // (docs/11 "human approval" before every public post) — deliberately NOT
  // granted alongside SocialOperate, so see ROLE_PERMISSIONS: only admin/
  // super_admin hold it, never AuctionStaff (the drafter role).
  SocialApprove: 'social:approve',
  IntelligenceRead: 'intelligence:read',
  LiveOperate: 'live:operate',
  WatchManage: 'watch:manage',
  EventOperate: 'event:operate',
  ListingContent: 'listing:content',
  AuditRead: 'audit:read',
  // Member identity, credit, security & performance engine (Revision 05).
  MemberRead: 'member:read',
  MemberManage: 'member:manage',
  MemberTemporaryGrant: 'member:temporary-grant',
  SecurityRead: 'security:read',
  SecurityVerify: 'security:verify',
  SecurityRelease: 'security:release',
  CreditRead: 'credit:read',
  CreditApprove: 'credit:approve',
  CreditOverride: 'credit:override',
  CreditSuspend: 'credit:suspend',
  PerformanceRead: 'performance:read',
  MemberFlagRead: 'member-flag:read',
  MemberFlagManage: 'member-flag:manage',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];
export const ALL_PERMISSIONS = Object.values(Permission) as [Permission, ...Permission[]];

const P = Permission;

const SELLER_PERMISSIONS: Permission[] = [
  P.OrganizationCreate,
  P.AssetCreate,
  P.ListingCreate,
  P.ListingSubmit,
  P.MediaManage,
  P.BidPlace,
  P.EoiSubmit,
  P.ExchangeParticipate,
  P.AiUse,
  P.IntelligenceRead,
  P.ListingContent,
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.Customer]: [P.BidPlace, P.EoiSubmit, P.ExchangeParticipate, P.CommercePay, P.WatchManage],
  [Role.Seller]: SELLER_PERMISSIONS,
  [Role.SellerStaff]: SELLER_PERMISSIONS,
  [Role.AuctionStaff]: [
    P.CustomerRead,
    P.AssetCreate,
    P.AssetManage,
    P.ListingCreate,
    P.ListingSubmit,
    P.ListingReview,
    P.ListingPublish,
    P.MediaManage,
    P.AuctionConfigure,
    P.AuctionOperate,
    P.BidPlace,
    P.EoiReview,
    P.ExchangeOperate,
    P.CommerceOperate,
    P.ConnectOperate,
    P.AiUse,
    P.SocialOperate,
    P.IntelligenceRead,
    P.LiveOperate,
    P.EventOperate,
    P.ListingContent,
    // Onsite auction desk: register members, grant temporary access, take/verify
    // spot deposits, read exposure — but NOT approve/override standing credit.
    P.MemberRead,
    P.MemberManage,
    P.MemberTemporaryGrant,
    P.SecurityRead,
    P.SecurityVerify,
    P.CreditRead,
    P.PerformanceRead,
    P.MemberFlagRead,
  ],
  [Role.Accounts]: [
    P.CustomerRead,
    P.CommerceOperate,
    // Credit control desk owns standing credit + security lifecycle.
    P.MemberRead,
    P.SecurityRead,
    P.SecurityVerify,
    P.SecurityRelease,
    P.CreditRead,
    P.CreditApprove,
    P.CreditOverride,
    P.CreditSuspend,
    P.PerformanceRead,
  ],
  [Role.Support]: [P.CustomerRead, P.ConnectOperate, P.MemberRead],
  [Role.Compliance]: [
    P.CustomerRead,
    P.KycManage,
    P.AuditRead,
    // Compliance owns internal flags/reviews + reads performance/security.
    P.MemberRead,
    P.SecurityRead,
    P.PerformanceRead,
    P.MemberFlagRead,
    P.MemberFlagManage,
  ],
  [Role.Admin]: [...ALL_PERMISSIONS],
  [Role.SuperAdmin]: [...ALL_PERMISSIONS],
};

/** Resolve the effective permission set for a set of roles. */
export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) set.add(permission);
  }
  return set;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission);
}

export function isRole(value: string): value is Role {
  return (ALL_ROLES as readonly string[]).includes(value);
}
