import { z } from 'zod';

/**
 * Cockpit / Dashboard contracts (Evolution E11b, pack doc 11 §Dashboard).
 *
 * A member may act personally OR for one organization they belong to, and the two are separate
 * books of record — a personal cockpit must never surface organization-attributed records, and an
 * organization cockpit must never surface a member's private activity. The context is therefore an
 * **explicit request parameter**, never inferred from "the org you happen to belong to": inferring
 * it would silently widen a read the moment someone is added to an organization.
 *
 * `context=organization` REQUIRES `organizationId`, and `context=personal` REJECTS it, so a request
 * can never be ambiguous about which book it is asking for. Authorization for the named
 * organization is enforced server-side (membership, or an explicit `organization:manage` grant).
 */

export const dashboardContextKinds = ['personal', 'organization'] as const;
export type DashboardContextKind = (typeof dashboardContextKinds)[number];

export const dashboardQuerySchema = z
  .object({
    context: z.enum(dashboardContextKinds).default('personal'),
    organizationId: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.context === 'organization' && !value.organizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationId'],
        message: 'organizationId is required when context is "organization"',
      });
    }
    if (value.context === 'personal' && value.organizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationId'],
        message: 'organizationId is not permitted when context is "personal"',
      });
    }
  });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
