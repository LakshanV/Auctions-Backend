import { PrismaClient } from '@prisma/client';
import { resolveRuntimeDatasourceUrl } from './runtime-url';

export { PrismaClient, Prisma } from '@prisma/client';
export * from '@prisma/client';
export { resolveRuntimeDatasourceUrl } from './runtime-url';

let client: PrismaClient | undefined;

/** Process-wide Prisma client singleton (routed off the session pooler at runtime). */
export function getPrisma(): PrismaClient {
  if (!client) {
    const datasourceUrl = resolveRuntimeDatasourceUrl();
    client = datasourceUrl ? new PrismaClient({ datasourceUrl }) : new PrismaClient();
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
