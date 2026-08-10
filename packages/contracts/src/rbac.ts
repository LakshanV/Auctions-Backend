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
  AuditRead: 'audit:read',
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
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.Customer]: [P.BidPlace],
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
  ],
  [Role.Accounts]: [P.CustomerRead],
  [Role.Support]: [P.CustomerRead],
  [Role.Compliance]: [P.CustomerRead, P.KycManage, P.AuditRead],
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
