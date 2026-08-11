import { Role, newId } from '@singha/contracts';
import { type PrismaService } from '../../prisma/prisma.service';

/**
 * Just-in-time provisioning for a real (Supabase-authenticated) caller (pack
 * doc 09). The IdP subject is NEVER the permanent business key: it is stored as
 * an ExternalIdentity linked to a Singha Customer, and that Customer id is the
 * durable identity. A caller with the same verified email is linked to the
 * existing Customer rather than duplicated.
 *
 * Roles are derived from persistent state, not the token: everyone is a Customer;
 * organisation membership elevates them to Seller / SellerStaff. Platform staff
 * roles (auction_staff, admin, …) are assigned out-of-band and are never granted
 * from a self-service login.
 */
const SUPABASE_CHANNEL = 'web' as const; // ExternalIdentity.channel enum
const key = (sub: string) => `supabase:${sub}`;

export async function provisionCustomer(
  prisma: PrismaService,
  sub: string,
  email: string | null,
  emailVerified: boolean,
): Promise<{ customerId: string; roles: Role[] }> {
  const externalId = key(sub);

  const existing = await prisma.externalIdentity.findUnique({
    where: { channel_externalId: { channel: SUPABASE_CHANNEL, externalId } },
  });

  let customerId: string;
  if (existing) {
    customerId = existing.customerId;
  } else {
    // FIX-10 — an unverified email must NEVER link to (take over) an existing
    // customer. Only a verified email may claim a pre-existing account; otherwise
    // we mint a fresh customer with NO email attached (so we neither take over nor
    // collide on the unique email). The email is bound later once verified.
    const linked =
      email && emailVerified ? await prisma.customer.findUnique({ where: { email } }) : null;
    const customer =
      linked ??
      (await prisma.customer.create({
        data: {
          id: newId(),
          status: 'active',
          email: emailVerified ? (email ?? undefined) : undefined,
        },
      }));
    customerId = customer.id;
    // Race-safe: if a concurrent request created the identity first, the unique
    // (channel, externalId) constraint rejects our insert — re-read the winner so
    // both requests resolve to the SAME durable customer id.
    try {
      await prisma.externalIdentity.create({
        data: {
          id: newId(),
          customerId,
          channel: SUPABASE_CHANNEL,
          externalId,
          verifiedAt: new Date(),
        },
      });
    } catch {
      const winner = await prisma.externalIdentity.findUnique({
        where: { channel_externalId: { channel: SUPABASE_CHANNEL, externalId } },
      });
      if (winner) customerId = winner.customerId;
    }
  }

  const memberships = await prisma.organizationMember.findMany({ where: { customerId } });
  const roles: Role[] = [Role.Customer];
  if (memberships.some((m) => m.role === 'owner' || m.role === 'admin')) roles.push(Role.Seller);
  if (memberships.some((m) => m.role === 'staff')) roles.push(Role.SellerStaff);

  return { customerId, roles };
}
