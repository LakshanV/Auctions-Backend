import { PrismaClient } from '@prisma/client';

export { PrismaClient, Prisma } from '@prisma/client';
export * from '@prisma/client';

let client: PrismaClient | undefined;

/** Process-wide Prisma client singleton. */
export function getPrisma(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
