import { z } from 'zod';

/**
 * Satellite Market Node + SEO contracts (Evolution E13, pack Addendum A + doc 11 §SEO). A node is a
 * presentation / origination / routing surface over the **one central** authoritative domain — never
 * a per-country ledger. Origination is attribution; a node cannot self-assert a binding record.
 */

export const nodeCapabilities = ['listings', 'offers', 'auctions', 'payments'] as const;
export type NodeCapabilityName = (typeof nodeCapabilities)[number];

/** A Local Commerce node attempts to originate a binding record (gated by mode/capability/verification). */
export const originateSchema = z.object({
  capability: z.enum(nodeCapabilities),
  subjectRef: z.string().optional(),
});
export type OriginateInput = z.infer<typeof originateSchema>;

/** Canonical + hreflang for a path (display currency / tracking never fork the URL). */
export const seoCanonicalSchema = z.object({
  baseUrl: z.string().url(),
  path: z.string().min(1),
  params: z.record(z.string(), z.string()).optional(),
  locales: z.array(z.string()).optional(),
});
export type SeoCanonicalInput = z.infer<typeof seoCanonicalSchema>;

/** schema.org Product/Offer JSON-LD for a listing landing page (derived; never a source of truth). */
export const seoListingSchema = z.object({
  baseUrl: z.string().url(),
  path: z.string().min(1),
  publicRef: z.string().min(1),
  title: z.string().min(1),
  category: z.string().optional(),
  priceMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  available: z.boolean().optional(),
});
export type SeoListingInput = z.infer<typeof seoListingSchema>;
