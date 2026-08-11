import { Injectable, type NestMiddleware } from '@nestjs/common';
import { type NextFunction, type Request, type Response } from 'express';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ANONYMOUS, makePrincipal, type Principal } from './principal';
import { verifyPrincipalToken } from './jwt';
import { verifySupabaseToken } from './supabase-jwt';
import { provisionCustomer } from './identity-provisioning';

/**
 * Resolves the Principal from a Bearer JWT and attaches it to the request. Two
 * token issuers are accepted (pack doc 09):
 *   1. Singha's own HS256 tokens (dev `/dev/token`, gated demo login) — carry
 *      roles + customerId directly.
 *   2. Real Supabase Auth session JWTs — verified against the project JWKS, then
 *      mapped to a Singha Customer (JIT-provisioned) with roles derived from
 *      persistent org membership.
 * A missing/invalid token yields an anonymous principal; permissioned routes
 * reject via PermissionsGuard.
 */
@Injectable()
export class PrincipalMiddleware implements NestMiddleware {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async use(
    req: Request & { principal?: Principal },
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    req.principal = ANONYMOUS;
    const header = req.headers.authorization;

    if (header && header.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length);
      const cfg = this.config.get();
      try {
        // 1) Singha-issued token.
        const claims = await verifyPrincipalToken(token, cfg.security.jwtSecret);
        req.principal = makePrincipal(claims.customerId, claims.roles);
      } catch {
        // 2) Real Supabase session token → map to a Singha Customer.
        try {
          const sb = await verifySupabaseToken(token, cfg.supabase.url);
          const { customerId, roles } = await provisionCustomer(this.prisma, sb.sub, sb.email);
          req.principal = makePrincipal(customerId, roles);
        } catch {
          req.principal = ANONYMOUS;
        }
      }
    }

    next();
  }
}
