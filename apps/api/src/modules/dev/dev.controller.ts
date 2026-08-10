import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { type DevTokenInput, devTokenSchema } from '@singha/contracts';
import { AppConfigService } from '../../config/config.service';
import { signPrincipal } from '../../shared/auth/jwt';
import { ZodBody } from '../../shared/validation/zod.pipe';

/**
 * Dev-only helper to mint principal tokens for local testing (docs/15 real auth
 * is a later phase). Disabled in production — returns 404 so it isn't a surface.
 */
@Controller('dev')
export class DevController {
  constructor(private readonly config: AppConfigService) {}

  @Post('token')
  async token(@Body(new ZodBody(devTokenSchema)) input: DevTokenInput) {
    const cfg = this.config.get();
    if (cfg.isProduction) throw new NotFoundException();
    const token = await signPrincipal(
      { customerId: input.customerId ?? null, roles: input.roles },
      cfg.security.jwtSecret,
    );
    return { token, roles: input.roles, customerId: input.customerId ?? null };
  }
}
