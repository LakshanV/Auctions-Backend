import { SetMetadata } from '@nestjs/common';
import { type Permission } from '@singha/contracts';

export const PERMISSIONS_KEY = 'singha:required_permissions';

/** Declare the permissions a route requires; enforced by PermissionsGuard. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
