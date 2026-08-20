import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { type ActorContextKind, Permission } from '@singha/contracts';
import { type PrismaService } from '../../prisma/prisma.service';
import { type Principal } from './principal';

/**
 * Personal-vs-organization acting context (pack doc 11 §Singha ID "company roles"; DECISIONS
 * D-0055/D-0056).
 *
 * A member may act for themselves OR for one organization they belong to, and the two are separate
 * books of record. Which book a request touches is therefore an **explicit request parameter**,
 * never inferred from "the organization the caller happens to belong to" — inferring it would
 * silently widen every read and re-attribute every write the moment someone is added to an
 * organization.
 *
 * This module is the single place those rules live, so the Cockpit, procurement and any future
 * context-aware vertical cannot drift apart on who is allowed to act for whom.
 */

/** What the caller asked for (already shape-validated by the route's Zod schema). */
export interface RequestedActorContext {
  context: ActorContextKind;
  organizationId?: string | undefined;
}

/**
 * The resolved, server-authorized context. Echo it back to the caller so a client is never in doubt
 * about whose records it is looking at. `role` is the caller's membership role in the organization;
 * `viaStaffPermission` marks a staff action authorized by an explicit platform grant rather than by
 * membership.
 */
export interface ResolvedActorContext {
  kind: ActorContextKind;
  customerId: string | null;
  organizationId: string | null;
  role: string | null;
  viaStaffPermission: boolean;
}

/** The `where` fragment that selects exactly one book of record for a buyer-attributed table. */
export interface ActorScopeFilter {
  buyerCustomerId?: string;
  buyerOrganizationId: string | null;
}

/**
 * Resolve + AUTHORIZE an acting context.
 *
 * - `personal` requires an authenticated customer, and REFUSES a smuggled `organizationId`.
 * - `organization` requires an explicit `organizationId` plus either real membership of THAT
 *   organization or the explicit `organization:manage` platform grant.
 *
 * A caller without membership is refused with 403 whether or not the organization exists — an
 * authorization check must not double as an organization-existence oracle. Only a staff caller
 * holding `organization:manage` (who is already entitled to enumerate organizations) sees a 404.
 */
export async function resolveActorContext(
  prisma: PrismaService,
  principal: Principal,
  requested: RequestedActorContext,
): Promise<ResolvedActorContext> {
  // Anything that is not an EXPLICIT organization request is personal — a missing/unknown
  // context can never produce an organization attribution.
  if (requested.context !== 'organization') {
    // Defence in depth: the route schema already rejects this pairing, but no code path may ever
    // turn a personal action into an organization-attributed one.
    if (requested.organizationId) {
      throw new BadRequestException('organizationId is not permitted in personal context');
    }
    if (!principal.customerId) throw new ForbiddenException('Authenticated customer required');
    return {
      kind: 'personal',
      customerId: principal.customerId,
      organizationId: null,
      role: null,
      viaStaffPermission: false,
    };
  }

  const organizationId = requested.organizationId;
  if (!organizationId) {
    throw new BadRequestException('organizationId is required in organization context');
  }

  if (principal.permissions.has(Permission.OrganizationManage)) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return {
      kind: 'organization',
      customerId: principal.customerId,
      organizationId,
      role: null,
      viaStaffPermission: true,
    };
  }

  const membership = principal.customerId
    ? await prisma.organizationMember.findFirst({
        where: { organizationId, customerId: principal.customerId },
        select: { role: true },
      })
    : null;
  if (!membership) {
    throw new ForbiddenException('Not permitted to act in this organization context');
  }
  return {
    kind: 'organization',
    customerId: principal.customerId,
    organizationId,
    role: String(membership.role),
    viaStaffPermission: false,
  };
}

/**
 * Is the caller entitled to act on a record ALREADY attributed to `organizationId`? Used when the
 * record — not the request — decides the book: an organization's request stays manageable by the
 * organization's members even after the individual who posted it leaves, and is never manageable
 * from someone's personal context.
 */
export async function isActingForOrganization(
  prisma: PrismaService,
  principal: Principal,
  organizationId: string,
): Promise<boolean> {
  if (principal.permissions.has(Permission.OrganizationManage)) return true;
  if (!principal.customerId) return false;
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, customerId: principal.customerId },
    select: { id: true },
  });
  return membership !== null;
}

/**
 * The `where` fragment for a buyer-attributed table under this context. Personal pins
 * `buyerOrganizationId: null` so an organization-attributed row can never appear in a personal
 * list; organization pins the organization id and omits the customer entirely, so a colleague's
 * row is included and the caller's own personal rows are not.
 */
export function buyerScopeFilter(context: ResolvedActorContext): ActorScopeFilter {
  if (context.kind === 'organization') {
    return { buyerOrganizationId: context.organizationId };
  }
  if (!context.customerId) throw new ForbiddenException('Authenticated customer required');
  return { buyerCustomerId: context.customerId, buyerOrganizationId: null };
}
