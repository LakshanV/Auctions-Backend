import { Injectable, type NestMiddleware } from '@nestjs/common';
import { type NextFunction, type Request, type Response } from 'express';
import { AppConfigService } from '../../config/config.service';
import { ANONYMOUS, makePrincipal, type Principal } from './principal';
import { verifyPrincipalToken } from './jwt';

/**
 * Resolves the Principal from a Bearer JWT and attaches it to the request. A
 * missing/invalid token yields an anonymous principal (no permissions) rather
 * than an error — routes that need permissions reject via PermissionsGuard.
 *
 * NOTE (Phase 1): tokens are minted by the dev-only /dev/token endpoint. Real
 * login/session issuance is a later security phase; the enforcement model here
 * is already the production one.
 */
@Injectable()
export class PrincipalMiddleware implements NestMiddleware {
  constructor(private readonly config: AppConfigService) {}

  async use(
    req: Request & { principal?: Principal },
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      try {
        const claims = await verifyPrincipalToken(
          header.slice('Bearer '.length),
          this.config.get().security.jwtSecret,
        );
        req.principal = makePrincipal(claims.customerId, claims.roles);
      } catch {
        req.principal = ANONYMOUS;
      }
    } else {
      req.principal = ANONYMOUS;
    }
    next();
  }
}
