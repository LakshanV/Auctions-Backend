import { z } from 'zod';
import { withActorContext } from './actor-context';

/**
 * Commercial Offer Engine V2 contracts (E4, pack doc 08). A proposal is a full commercial
 * bundle (price + quantity + trade/delivery/payment terms), not just an amount. Money is integer
 * minor units; quantity travels as a string (Decimal, never float — DECISIONS D5).
 */

export const offerAwardPolicies = ['MANUAL_SELECTION', 'AUTO_HIGHEST'] as const;
export type OfferAwardPolicy = (typeof offerAwardPolicies)[number];

export const offerAuthorTypes = ['buyer', 'seller', 'operator'] as const;
export type OfferAuthorType = (typeof offerAuthorTypes)[number];

export const freightResponsibilities = ['buyer', 'seller', 'singha'] as const;
export type FreightResponsibility = (typeof freightResponsibilities)[number];

/** The full commercial terms of one immutable `OfferRevision`. */
export const offerProposalSchema = z
  .object({
    totalPriceMinor: z.number().int().nonnegative().optional(),
    unitPriceMinor: z.number().int().nonnegative().optional(),
    currency: z.string().length(3),
    quantity: z.string().optional(),
    quantityUnitCode: z.string().optional(),
    incoterm: z.string().max(12).optional(),
    originLocationId: z.string().optional(),
    destinationLocationId: z.string().optional(),
    deliveryDate: z.string().datetime().optional(),
    deliveryWindowStart: z.string().datetime().optional(),
    deliveryWindowEnd: z.string().datetime().optional(),
    paymentTerms: z.string().max(500).optional(),
    freightResponsibility: z.enum(freightResponsibilities).optional(),
    validUntil: z.string().datetime().optional(),
    notes: z.string().max(2000).optional(),
  })
  // A proposal must name a price (total or per-unit) — an offer with no price is not a proposal.
  .refine((p) => p.totalPriceMinor != null || p.unitPriceMinor != null, {
    message: 'a proposal must carry a total or unit price',
    path: ['totalPriceMinor'],
  });
export type OfferProposal = z.infer<typeof offerProposalSchema>;

/**
 * Submit a new offer (a buyer's first proposal) on a listing.
 *
 * The submission carries an EXPLICIT acting context (`actor-context.ts`): `personal` (the default,
 * which can never produce an organization attribution) or `organization` + `organizationId`. An
 * organization-attributed offer is durably stamped with that organization at submission and lives
 * in the organization's book — it is never inferred from the submitter's memberships, and a
 * personal offer can never be silently re-attributed. The individual submitter is still recorded,
 * so audit/KYC keep a natural person.
 */
export const submitOfferSchema = withActorContext({
  listingId: z.string().min(1),
  saleMethodCode: z.string().min(1),
  sealed: z.boolean().optional(),
  proposal: offerProposalSchema,
});
export type SubmitOfferInput = z.infer<typeof submitOfferSchema>;

/**
 * Which book of offers to read on the buyer-owned console. Same explicit-context rules as
 * submission: a personal list never contains organization-attributed offers, and an organization
 * list never contains a member's personal ones.
 */
export const myOffersQuerySchema = withActorContext({});
export type MyOffersQuery = z.infer<typeof myOffersQuerySchema>;

/** Counter an existing offer — appends a new revision (never overwrites prior terms). */
export const counterOfferSchema = z.object({
  offerId: z.string().min(1),
  proposal: offerProposalSchema,
});
export type CounterOfferInput = z.infer<typeof counterOfferSchema>;

/** Body for countering an offer addressed by path (`POST /offers/:id/counter`). */
export const counterOfferBodySchema = z.object({
  proposal: offerProposalSchema,
});
export type CounterOfferBody = z.infer<typeof counterOfferBodySchema>;

/**
 * Award a sealed offer for a listing after its controlled reveal. `policy` defaults to
 * MANUAL_SELECTION — the highest sealed proposal is NEVER auto-awarded (DECISIONS D4);
 * MANUAL_SELECTION therefore requires an explicit `selectedOfferId`. AUTO_HIGHEST is only
 * honoured when the authorised seller/operator explicitly opts into it here.
 */
export const awardSealedOfferSchema = z
  .object({
    policy: z.enum(offerAwardPolicies).default('MANUAL_SELECTION'),
    selectedOfferId: z.string().min(1).optional(),
  })
  .refine((v) => v.policy !== 'MANUAL_SELECTION' || v.selectedOfferId != null, {
    message:
      'MANUAL_SELECTION requires an explicit selectedOfferId (D4: the highest never auto-awards)',
    path: ['selectedOfferId'],
  });
export type AwardSealedOfferInput = z.infer<typeof awardSealedOfferSchema>;
