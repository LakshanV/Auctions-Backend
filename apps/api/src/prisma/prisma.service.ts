import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient, resolveRuntimeDatasourceUrl } from '@singha/database';

/** Prisma lifecycle bound to Nest (docs/03: server owns authoritative state). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Route the long-running client off the Supabase session pooler (:5432) onto the
    // transaction pooler (:6543) so it never exhausts the 15-slot session cap that
    // migrations depend on. No-op unless DATABASE_URL is the :5432 session pooler.
    const datasourceUrl = resolveRuntimeDatasourceUrl();
    super(datasourceUrl ? { datasourceUrl } : undefined);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
