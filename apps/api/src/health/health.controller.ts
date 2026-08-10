import { Controller, Get, HttpCode } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { liveness, readiness } from './health.logic';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness — process is up. Kept at the root, outside the /api/v1 prefix. */
  @Get('healthz')
  @HttpCode(200)
  live() {
    return liveness('api');
  }

  /** Readiness — dependencies (database) reachable. */
  @Get('readyz')
  async ready() {
    let databaseOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseOk = true;
    } catch {
      databaseOk = false;
    }
    return readiness({ database: databaseOk });
  }
}
