import { Body, Controller, Post } from '@nestjs/common';
import { type DemoLoginInput, demoLoginSchema } from '@singha/contracts';
import { AuthService } from './auth.service';
import { ZodBody } from '../../shared/validation/zod.pipe';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/v1/auth/demo — passwordless demo login (returns a bidder token). */
  @Post('demo')
  demo(@Body(new ZodBody(demoLoginSchema)) input: DemoLoginInput) {
    return this.auth.demoLogin(input);
  }
}
