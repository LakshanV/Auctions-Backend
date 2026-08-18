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
  // §21/§22 (RW6) — scoped Singha Live floor roles (a real auction has separate people on the
  // rostrum, the clerk's desk and the broadcast gallery). Each holds exactly its slice; auction
  // staff keep the umbrella `live:operate` + all three scoped grants.
  Auctioneer: 'auctioneer',
  Clerk: 'clerk',
  Producer: 'producer',
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
  // RW5 — an owning seller may manage the offers on THEIR OWN listing (counter/reject/accept,
  // and — for sealed tenders — reveal/compare/award) without holding the full `exchange:operate`
  // operator grant. This permission only lets the request REACH the route; the service still
  // enforces a server-side listing-ownership check (never a global grant — see rbac.ts header).
  // Held by Seller/SellerStaff (their own listings) and by AuctionStaff/Admin (any, as operators).
  ExchangeOperateOwn: 'exchange:operate-own',
  CommercePay: 'commerce:pay',
  CommerceOperate: 'commerce:operate',
  ConnectOperate: 'connect:operate',
  AiUse: 'ai:use',
  // Customer-facing AI conversation assistant (AIC-1) — distinct from AiUse (staff copilot /
  // listing draft) and ConnectOperate (staff channel operation). Non-binding: lets a customer
  // (or seller/seller_staff) converse with the assistant about their OWN conversation/listing
  // context; it never grants bid/offer placement, which stays gated by BidPlace/EoiSubmit/etc.
  AiConverse: 'ai:converse',
  SocialOperate: 'social:operate',
  // Approving a publication is a distinct human gate from drafting/operating it
  // (docs/11 "human approval" before every public post) — deliberately NOT
  // granted alongside SocialOperate, so see ROLE_PERMISSIONS: only admin/
  // super_admin hold it, never AuctionStaff (the drafter role).
  SocialApprove: 'social:approve',
  IntelligenceRead: 'intelligence:read',
  LiveOperate: 'live:operate',
  // §21/§22 (RW6) — scoped Singha Live floor roles. Auctioneer runs the per-lot state machine
  // (on-block / going once/twice / sold / passed); clerk relays floor/phone/absentee bids through
  // the authoritative engine; producer controls the broadcast (start/stop/simulcast). The umbrella
  // `live:operate` (auction staff) still implies all three.
  LiveConduct: 'live:conduct',
  LiveClerk: 'live:clerk',
  LiveProduce: 'live:produce',
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
  // RW5 — manage offers on their OWN listings (ownership enforced server-side); never the broad
  // `exchange:operate` operator grant.
  P.ExchangeOperateOwn,
  P.AiUse,
  P.AiConverse,
  P.IntelligenceRead,
  P.ListingContent,
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.Customer]: [
    P.BidPlace,
    P.EoiSubmit,
    P.ExchangeParticipate,
    P.CommercePay,
    P.WatchManage,
    P.AiConverse,
  ],
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
    // Operators reach the owner-scoped offer routes too (they manage any listing's offers); the
    // service short-circuits them to the operator viewer, so no ownership check is applied.
    P.ExchangeOperateOwn,
    P.CommerceOperate,
    P.ConnectOperate,
    P.AiUse,
    P.SocialOperate,
    P.IntelligenceRead,
    P.LiveOperate,
    // Staff umbrella over the scoped Singha Live floor roles (RW6).
    P.LiveConduct,
    P.LiveClerk,
    P.LiveProduce,
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
  // RW6 scoped Singha Live floor roles — each holds exactly its slice (auction staff hold all).
  [Role.Auctioneer]: [P.LiveConduct],
  [Role.Clerk]: [P.LiveClerk],
  [Role.Producer]: [P.LiveProduce],
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
