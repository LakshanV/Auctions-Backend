import { type Permission, type Role, permissionsForRoles } from '@singha/contracts';

/**
 * Authenticator assurance level (pack FIX-08). Derived from the trusted session
 * (Supabase `aal` claim), never from a client header or the frontend. AAL2 =
 * the caller completed multi-factor step-up.
 */
export type AssuranceLevel = 'aal1' | 'aal2';

/** The authenticated caller resolved from the request (docs/15). */
export interface Principal {
  customerId: string | null;
  roles: Role[];
  permissions: Set<Permission>;
  aal: AssuranceLevel;
}

export function makePrincipal(
  customerId: string | null,
  roles: Role[],
  aal: AssuranceLevel = 'aal1',
): Principal {
  return { customerId, roles, permissions: permissionsForRoles(roles), aal };
}

export const ANONYMOUS: Principal = {
  customerId: null,
  roles: [],
  permissions: new Set(),
  aal: 'aal1',
};

export function hasAllPermissions(principal: Principal, required: readonly Permission[]): boolean {
  return required.every((permission) => principal.permissions.has(permission));
}
