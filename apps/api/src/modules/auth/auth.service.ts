import { ForbiddenException, Injectable } from '@nestjs/common';
import { type DemoLoginInput, Role, newId } from '@singha/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { signPrincipal } from '../../shared/auth/jwt';

/**
 * Demo auth (passwordless email → bidder token) so a hosted deployment can be
 * exercised immediately. Gated by DEMO_AUTH_ENABLED. Replace with Supabase Auth
 * / password auth for real production (see SUPABASE_SETUP.md).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async demoLogin(input: DemoLoginInput) {
    const cfg = this.config.get();
    if (!cfg.demo.authEnabled) throw new ForbiddenException('Demo login is disabled');

    let customer = await this.prisma.customer.findUnique({ where: { email: input.email } });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          id: newId(),
          email: input.email,
          legalName: input.name,
          status: 'active',
          kycStatus: 'none',
        },
      });
    }

    const token = await signPrincipal(
      { customerId: customer.id, roles: [Role.Customer] },
      cfg.security.jwtSecret,
    );
    return { token, customerId: customer.id, email: customer.email };
  }
}
