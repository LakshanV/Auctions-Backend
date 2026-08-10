import { type Permission, type Role, permissionsForRoles } from '@singha/contracts';

/** The authenticated caller resolved from the request (docs/15). */
export interface Principal {
  customerId: string | null;
  roles: Role[];
  permissions: Set<Permission>;
}

export function makePrincipal(customerId: string | null, roles: Role[]): Principal {
  return { customerId, roles, permissions: permissionsForRoles(roles) };
}

export const ANONYMOUS: Principal = { customerId: null, roles: [], permissions: new Set() };

export function hasAllPermissions(principal: Principal, required: readonly Permission[]): boolean {
  return required.every((permission) => principal.permissions.has(permission));
}
