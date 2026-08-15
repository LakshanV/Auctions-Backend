import { z } from 'zod';
import { offerProposalSchema } from './offer-domains';

/**
 * Procurement / two-sided-market contracts (Evolution E9, pack doc 09). The buyer-initiated side —
 * "I NEED SOMETHING TO BUY": an RFQ / Request-Supply / reverse-tender request that suppliers respond
 * to with commercial proposals (reusing the E4 proposal bundle). Selection is buyer-explicit and
 * **never auto-awarded** — matching may recommend, but a human buyer decides (pack §09; consistent
 * with DECISIONS D4).
 */

export const procurementRequestTypes = ['RFQ', 'REQUEST_SUPPLY', 'REVERSE_TENDER'] as const;
export type ProcurementRequestType = (typeof procurementRequestTypes)[number];

export const procurementStatuses = ['open', 'closed', 'awarded', 'cancelled'] as const;
export type ProcurementStatus = (typeof procurementStatuses)[number];

export const pricingBasesProcurement = ['total', 'per_unit'] as const;

/** Create a procurement request (the "wanted" side). */
export const createProcurementRequestSchema = z.object({
  type: z.enum(procurementRequestTypes),
  title: z.string().min(1),
  category: z.string().optional(),
  specification: z.string().optional(),
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,9})?$/)
    .optional(),
  quantityUnitCode: z.string().optional(),
  destinationCountry: z.string().optional(),
  deliveryBy: z.string().datetime().optional(),
  currency: z.string().length(3),
  paymentTerms: z.string().optional(),
  operatorCode: z.string().optional(),
  /** Submission window close — proposals after this are rejected. */
  submissionCloseAt: z.string().datetime().optional(),
});
export type CreateProcurementRequestInput = z.infer<typeof createProcurementRequestSchema>;

/** A supplier's proposal to a request — the same commercial bundle as an offer (E4). */
export const submitProcurementProposalSchema = z.object({
  proposal: offerProposalSchema,
  notes: z.string().optional(),
});
export type SubmitProcurementProposalInput = z.infer<typeof submitProcurementProposalSchema>;

/**
 * Award a procurement request — REQUIRES an explicit chosen proposal. There is no auto-award: the
 * cheapest/best proposal is never bound automatically (pack §09; DECISIONS D4).
 */
export const awardProcurementSchema = z.object({
  selectedProposalId: z.string().min(1),
});
export type AwardProcurementInput = z.infer<typeof awardProcurementSchema>;
