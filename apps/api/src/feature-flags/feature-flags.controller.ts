import { Controller, Get } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';

/** GET /api/v1/feature-flags — read-only; the server is the source of truth. */
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  list() {
    return this.flags.view();
  }
}
