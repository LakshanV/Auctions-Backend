import { ulid } from 'ulid';

/**
 * Opaque, lexicographically-sortable identifiers (ULID) for permanent business
 * records. Non-negotiable rule #1 (docs/04): these survive V3/V4/V5 rewrites.
 * Human-readable references (lot numbers, invoice numbers) are SEPARATE fields.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type CustomerId = Brand<string, 'CustomerId'>;
export type OrganizationId = Brand<string, 'OrganizationId'>;
export type AssetId = Brand<string, 'AssetId'>;
export type ListingId = Brand<string, 'ListingId'>;
export type SaleEventId = Brand<string, 'SaleEventId'>;
export type AuctionId = Brand<string, 'AuctionId'>;
export type BidId = Brand<string, 'BidId'>;
export type InvoiceId = Brand<string, 'InvoiceId'>;
export type PaymentId = Brand<string, 'PaymentId'>;
export type SettlementId = Brand<string, 'SettlementId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type PublicationId = Brand<string, 'PublicationId'>;
export type MediaId = Brand<string, 'MediaId'>;
export type AuditEventId = Brand<string, 'AuditEventId'>;
export type OutboxEventId = Brand<string, 'OutboxEventId'>;
export type EventId = Brand<string, 'EventId'>;

/** ULID canonical form: 26 chars, Crockford base32 (excludes I, L, O, U). */
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Mint a fresh branded id. `newId<'CustomerId'>()` → CustomerId. */
export function newId<B extends string = string>(): Brand<string, B> {
  return ulid() as Brand<string, B>;
}

export function isUlid(value: string): boolean {
  return ULID_RE.test(value);
}

/** Validate + brand an id received from the wire/DB. Throws on malformed input. */
export function assertId<B extends string>(value: string): Brand<string, B> {
  if (!isUlid(value)) {
    throw new Error(`Invalid ULID identifier: ${JSON.stringify(value)}`);
  }
  return value as Brand<string, B>;
}
