import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANONYMOUS, type Principal } from './principal';
import { ASSURANCE_KEY } from './require-assurance.decorator';

/**
 * Global guard enforcing @RequireAssurance (AAL2) on sensitive commands
 * (pack FIX-08 / doc 04). Runs AFTER PermissionsGuard so the order is:
 * authenticate → permission authorize → require AAL2 → (object authz in service).
 *
 * When the caller is authenticated+permitted but has not completed MFA step-up,
 * the response carries a machine-readable `MFA_REQUIRED` code so the frontend can
 * trigger a real Supabase step-up and retry — the button being hidden is never
 * the boundary.
 */
@Injectable()
export class AssuranceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(ASSURANCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ principal?: Principal }>();
    const principal = request.principal ?? ANONYMOUS;
    if (principal.aal !== 'aal2') {
      throw new ForbiddenException({
        code: 'MFA_REQUIRED',
        message: 'Multi-factor step-up authentication is required for this operation',
      });
    }
    return true;
  }
}
