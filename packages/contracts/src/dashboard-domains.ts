import { type z } from 'zod';
import { actorContextKinds, withActorContext } from './actor-context';

/**
 * Cockpit / Dashboard contracts (Evolution E11b, pack doc 11 §Dashboard).
 *
 * A member may act personally OR for one organization they belong to, and the two are separate
 * books of record — a personal cockpit must never surface organization-attributed records, and an
 * organization cockpit must never surface a member's private activity. The context rules live in
 * `actor-context.ts` and are shared with every other context-aware vertical (procurement, …):
 * `context=organization` REQUIRES `organizationId`, `context=personal` REJECTS it, and the named
 * organization is authorized server-side (membership, or an explicit `organization:manage` grant).
 */

export const dashboardContextKinds = actorContextKinds;
export type DashboardContextKind = (typeof dashboardContextKinds)[number];

export const dashboardQuerySchema = withActorContext({});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
