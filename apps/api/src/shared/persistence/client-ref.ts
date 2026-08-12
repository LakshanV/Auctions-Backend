import { type Prisma } from '@singha/database';

/**
 * Atomic, never-recycled human-readable reference allocators (Revision 05 §3/§10).
 * A Postgres sequence guarantees uniqueness under concurrent registration without
 * MAX()+1 races. Format is configurable via the prefix; the numeric part is the
 * raw sequence value zero-padded to 6 digits (it naturally grows past 6). The
 * opaque ULID primary key remains the durable identity — this is a SEPARATE field.
 */

const PAD = 6;

function format(prefix: string, seq: bigint): string {
  return `${prefix}-${seq.toString().padStart(PAD, '0')}`;
}

async function nextval(tx: Prisma.TransactionClient, sequence: string): Promise<bigint> {
  const rows = await tx.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('${sequence}') AS nextval`,
  );
  return BigInt(rows[0]!.nextval);
}

/** Draw the next Client ID (e.g. CUS-000001) inside the caller's transaction. */
export async function allocateClientReference(tx: Prisma.TransactionClient): Promise<string> {
  return format('CUS', await nextval(tx, 'customer_client_ref_seq'));
}

/** Draw the next Organization reference (e.g. ORG-000001). */
export async function allocateOrganizationReference(tx: Prisma.TransactionClient): Promise<string> {
  return format('ORG', await nextval(tx, 'organization_ref_seq'));
}
