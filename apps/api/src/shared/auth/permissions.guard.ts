import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission } from '@singha/contracts';
import { ANONYMOUS, hasAllPermissions, type Principal } from './principal';
import { PERMISSIONS_KEY } from './require-permissions.decorator';

/** Global guard enforcing @RequirePermissions on the SERVER (docs/15). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ principal?: Principal }>();
    const principal = request.principal ?? ANONYMOUS;
    if (!hasAllPermissions(principal, required)) {
      throw new ForbiddenException(`Missing required permission: ${required.join(', ')}`);
    }
    return true;
  }
}
