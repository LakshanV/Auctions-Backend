import { z } from 'zod';

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

/** Submit a new offer (a buyer's first proposal) on a listing. */
export const submitOfferSchema = z.object({
  listingId: z.string().min(1),
  saleMethodCode: z.string().min(1),
  sealed: z.boolean().optional(),
  proposal: offerProposalSchema,
});
export type SubmitOfferInput = z.infer<typeof submitOfferSchema>;

/** Counter an existing offer — appends a new revision (never overwrites prior terms). */
export const counterOfferSchema = z.object({
  offerId: z.string().min(1),
  proposal: offerProposalSchema,
});
export type CounterOfferInput = z.infer<typeof counterOfferSchema>;
