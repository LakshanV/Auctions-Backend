import { z } from 'zod';
import { ulid } from 'ulid';

/**
 * Canonical domain event names (docs/16). ADDITIVE-ONLY: never rename or reuse.
 * The transactional outbox (docs/16) commits these atomically with the business
 * transaction; consumers are idempotent.
 */
export const DomainEventName = {
  CustomerVerified: 'CUSTOMER_VERIFIED',
  ListingApproved: 'LISTING_APPROVED',
  ListingPublished: 'LISTING_PUBLISHED',
  AuctionOpened: 'AUCTION_OPENED',
  BidAccepted: 'BID_ACCEPTED',
  BidderOutbid: 'BIDDER_OUTBID',
  SoftCloseExtended: 'SOFT_CLOSE_EXTENDED',
  AuctionClosed: 'AUCTION_CLOSED',
  SaleConfirmed: 'SALE_CONFIRMED',
  EoiSubmitted: 'EOI_SUBMITTED',
  EoiAccepted: 'EOI_ACCEPTED',
  InvoiceIssued: 'INVOICE_ISSUED',
  PaymentConfirmed: 'PAYMENT_CONFIRMED',
  ReleaseApproved: 'RELEASE_APPROVED',
  ItemCollected: 'ITEM_COLLECTED',
  SellerSettled: 'SELLER_SETTLED',
  SocialPublicationRequested: 'SOCIAL_PUBLICATION_REQUESTED',
  SocialPublicationPublished: 'SOCIAL_PUBLICATION_PUBLISHED',
  LiveBroadcastStarted: 'LIVE_BROADCAST_STARTED',
  LiveBroadcastEnded: 'LIVE_BROADCAST_ENDED',
} as const;

export type DomainEventName = (typeof DomainEventName)[keyof typeof DomainEventName];

export const ALL_DOMAIN_EVENT_NAMES = Object.values(DomainEventName) as [
  DomainEventName,
  ...DomainEventName[],
];

/** Who caused an event. AI is always a distinct, auditable actor type (docs/15). */
export const actorSchema = z.object({
  type: z.enum(['customer', 'staff', 'system', 'ai']),
  id: z.string().nullable(),
});
export type Actor = z.infer<typeof actorSchema>;

/**
 * The event envelope carried by the outbox and internal event bus. Payload is a
 * versioned, event-specific object validated by its own schema downstream.
 */
export const eventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  name: z.enum(ALL_DOMAIN_EVENT_NAMES),
  occurredAt: z.string().datetime(),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  /** Schema version of the payload for this event name (additive migrations). */
  payloadVersion: z.number().int().positive().default(1),
  correlationId: z.string().min(1),
  causationId: z.string().min(1).nullable().default(null),
  actor: actorSchema,
  payload: z.record(z.unknown()),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export interface CreateEnvelopeInput {
  name: DomainEventName;
  aggregateType: string;
  aggregateId: string;
  actor: Actor;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string | null;
  payloadVersion?: number;
  occurredAt?: Date;
}

/** Build a validated envelope, defaulting ids/timestamps. */
export function createEnvelope(input: CreateEnvelopeInput): EventEnvelope {
  return eventEnvelopeSchema.parse({
    eventId: ulid(),
    name: input.name,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payloadVersion: input.payloadVersion ?? 1,
    correlationId: input.correlationId ?? ulid(),
    causationId: input.causationId ?? null,
    actor: input.actor,
    payload: input.payload,
  });
}
