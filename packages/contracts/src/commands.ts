import { z } from 'zod';
import { CATEGORY_KEYS } from './categories';
import { ALL_ROLES } from './rbac';

/**
 * Command DTOs (docs/16). The API exposes business COMMANDS, not raw PATCH of
 * commercial state. These Zod schemas are the single source of truth for request
 * validation (server-side) and are shared with tests.
 */
export const saleMethodValues = [
  'TIMED_AUCTION',
  'EXPRESSION_OF_INTEREST',
  'BUY_NOW',
  'MAKE_OFFER',
  'SEALED_TENDER',
  'LIVE_HYBRID',
] as const;
export const channelValues = ['web', 'whatsapp', 'facebook', 'instagram', 'email', 'sms'] as const;
export const kycStatusValues = ['none', 'pending', 'verified', 'rejected'] as const;
export const mediaKindValues = ['image', 'video', 'document', 'video_thumbnail'] as const;
export const orgRoleValues = ['owner', 'admin', 'staff'] as const;

const publicRef = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[A-Za-z0-9-]+$/, 'must be alphanumeric with dashes');

export const registerCustomerSchema = z.object({
  legalName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(4).max(32).optional(),
});
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

export const linkExternalIdentitySchema = z.object({
  channel: z.enum(channelValues),
  externalId: z.string().min(1).max(200),
});
export type LinkExternalIdentityInput = z.infer<typeof linkExternalIdentitySchema>;

export const setKycSchema = z.object({ status: z.enum(kycStatusValues) });
export type SetKycInput = z.infer<typeof setKycSchema>;

export const createOrganizationSchema = z.object({
  legalName: z.string().min(1).max(200),
  publicRef,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const addOrganizationMemberSchema = z.object({
  customerId: z.string().min(1),
  role: z.enum(orgRoleValues).default('staff'),
});
export type AddOrganizationMemberInput = z.infer<typeof addOrganizationMemberSchema>;

export const createAssetSchema = z.object({
  category: z.enum(CATEGORY_KEYS),
  attributes: z.record(z.unknown()).default({}),
  ownerCustomerId: z.string().min(1).optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const updateAssetAttributesSchema = z.object({
  attributes: z.record(z.unknown()),
});
export type UpdateAssetAttributesInput = z.infer<typeof updateAssetAttributesSchema>;

export const createListingSchema = z.object({
  assetId: z.string().min(1),
  saleMethod: z.enum(saleMethodValues),
  title: z.string().max(200).optional(),
  publicRef,
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const reviewListingSchema = z.object({
  decision: z.enum(['approve', 'changes_required']),
  note: z.string().max(1000).optional(),
});
export type ReviewListingInput = z.infer<typeof reviewListingSchema>;

// Constrained media visibility (pack FIX-06): documents/evidence are never an
// unconstrained free-text access class. Only `public` media is exposed on the
// public catalogue; `private`/`internal` require an authorized access path.
export const mediaVisibilityValues = ['public', 'private', 'internal'] as const;
export type MediaVisibility = (typeof mediaVisibilityValues)[number];

/**
 * Register a previously-uploaded object as media (pack FIX-04/05/06). The
 * `storageKey` MUST be a backend-issued, asset-scoped path returned by
 * `createUploadUrl` — the backend re-validates the namespace and verifies the
 * object actually exists before it is ever marked ready. Metadata is additive
 * and optional so existing callers keep working.
 */
export const registerMediaSchema = z.object({
  kind: z.enum(mediaKindValues),
  storageKey: z.string().min(1).max(500),
  visibility: z.enum(mediaVisibilityValues).optional(),
  caption: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isCover: z.boolean().optional(),
  mimeType: z.string().max(200).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  width: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
  durationMs: z.number().int().min(0).optional(),
  checksum: z.string().max(200).optional(),
});
export type RegisterMediaInput = z.infer<typeof registerMediaSchema>;

export const addDerivativeSchema = z.object({
  method: z.string().min(1).max(100),
  storageKey: z.string().min(1).max(500),
});
export type AddDerivativeInput = z.infer<typeof addDerivativeSchema>;

export const createUploadUrlSchema = z.object({
  filename: z.string().min(1).max(200),
  kind: z.enum(mediaKindValues).default('image'),
  contentType: z.string().max(200).optional(),
  sizeBytes: z.number().int().min(0).optional(),
});
export type CreateUploadUrlInput = z.infer<typeof createUploadUrlSchema>;

// Passwordless demo login (email → bidder token). Not for real production auth.
export const demoLoginSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
});
export type DemoLoginInput = z.infer<typeof demoLoginSchema>;

export const devTokenSchema = z.object({
  customerId: z.string().optional(),
  roles: z.array(z.enum(ALL_ROLES)).default([]),
  // Assurance level for the dev token (pack FIX-08). Defaults to aal2 so local
  // staff flows work; request 'aal1' to reproduce the MFA-required denial path.
  aal: z.enum(['aal1', 'aal2']).default('aal2'),
});
export type DevTokenInput = z.infer<typeof devTokenSchema>;

// --- Auction engine (docs/07) ---------------------------------------------
export const bidSourceValues = [
  'online',
  'floor',
  'phone',
  'absentee',
  'proxy',
  'auctioneer',
] as const;

export const createAuctionSchema = z.object({
  listingId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  currency: z.string().length(3).default('LKR'),
  openingBidMinor: z.number().int().positive(),
  reserveMinor: z.number().int().positive().nullable().default(null),
  reserveVisible: z.boolean().default(false),
  incrementMinor: z.number().int().positive(),
  softCloseTriggerSec: z.number().int().positive().default(10),
  softCloseExtendSec: z.number().int().positive().default(20),
  buyerPremiumPct: z.number().min(0).default(0),
});
export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;

export const placeBidSchema = z.object({
  /** The bidder's PRIVATE maximum (proxy). Never exposed to other bidders. */
  maxAmountMinor: z.number().int().positive(),
  source: z.enum(bidSourceValues).default('online'),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type PlaceBidInput = z.infer<typeof placeBidSchema>;

// --- Expression of Interest (docs/07 — EOI) --------------------------------
// A private, structured submission. Values are NEVER exposed to competing
// bidders; only the submitter and authorised staff can read them.
export const submitEoiSchema = z.object({
  listingId: z.string().min(1),
  /** Optional indicative amount (minor units). Some listings require it. */
  amountMinor: z.number().int().positive().nullable().default(null),
  currency: z.string().length(3).default('LKR'),
  message: z.string().max(2000).optional(),
  conditions: z.string().max(2000).optional(),
  /** Optional expiry of the offer's validity. */
  expiresAt: z.string().datetime().nullable().default(null),
});
export type SubmitEoiInput = z.infer<typeof submitEoiSchema>;

export const eoiReviewDecisionValues = [
  'review',
  'shortlist',
  'negotiate',
  'accept',
  'decline',
] as const;
export const reviewEoiSchema = z.object({
  decision: z.enum(eoiReviewDecisionValues),
  note: z.string().max(2000).optional(),
});
export type ReviewEoiInput = z.infer<typeof reviewEoiSchema>;

// --- Exchange scaffolds (docs/07: Buy Now / Make Offer / Sealed Tender) -----
const money = z.number().int().positive();

/** Staff sets the Buy Now price on a BUY_NOW listing. */
export const setBuyNowPriceSchema = z.object({
  amountMinor: money,
  currency: z.string().length(3).default('LKR'),
});
export type SetBuyNowPriceInput = z.infer<typeof setBuyNowPriceSchema>;

/** Buyer places an offer on a MAKE_OFFER listing. */
export const makeOfferSchema = z.object({
  amountMinor: money,
  currency: z.string().length(3).default('LKR'),
  note: z.string().max(2000).optional(),
});
export type MakeOfferInput = z.infer<typeof makeOfferSchema>;

export const offerResponseValues = ['counter', 'accept', 'reject'] as const;
/** Staff responds to an offer; `amountMinor` required only for a counter. */
export const respondOfferSchema = z
  .object({
    response: z.enum(offerResponseValues),
    amountMinor: money.optional(),
    note: z.string().max(2000).optional(),
  })
  .refine((v) => v.response !== 'counter' || v.amountMinor != null, {
    message: 'A counter requires amountMinor',
    path: ['amountMinor'],
  });
export type RespondOfferInput = z.infer<typeof respondOfferSchema>;

/** Buyer submits a sealed tender bid. */
export const submitTenderSchema = z.object({
  amountMinor: money,
  currency: z.string().length(3).default('LKR'),
});
export type SubmitTenderInput = z.infer<typeof submitTenderSchema>;

// --- Commerce (docs/14) ----------------------------------------------------
/** Staff issues an invoice for a confirmed sale. */
export const issueInvoiceSchema = z.object({
  listingId: z.string().min(1),
  otherFeesMinor: z.number().int().nonnegative().default(0),
  depositAppliedMinor: z.number().int().nonnegative().default(0),
});
export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>;

/** Buyer records a (manual) payment against an invoice; proof ≠ paid. */
export const recordPaymentSchema = z.object({
  amountMinor: money,
  method: z.string().min(1).max(50).default('bank_transfer'),
  proofRef: z.string().max(500).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

/** Accounts verifies (or rejects) a pending payment. */
export const verifyPaymentSchema = z.object({
  decision: z.enum(['confirm', 'reject']),
  note: z.string().max(1000).optional(),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const fulfilmentStateValues = [
  'ready_for_pickup',
  'pickup_booked',
  'in_delivery',
  'collected',
  'delivered',
  'completed',
] as const;
/** Staff advances the fulfilment state machine. */
export const advanceFulfilmentSchema = z.object({
  state: z.enum(fulfilmentStateValues),
  note: z.string().max(1000).optional(),
});
export type AdvanceFulfilmentInput = z.infer<typeof advanceFulfilmentSchema>;

/** Accounts disburses the seller settlement (append-only ledger event). */
export const settleSchema = z.object({
  deductionsMinor: z.number().int().nonnegative().default(0),
  reference: z.string().max(200).optional(),
  reason: z.string().max(1000).optional(),
});
export type SettleInput = z.infer<typeof settleSchema>;

// --- Singha Connect (docs/09) ----------------------------------------------
/** Inbound message from a channel adapter/webhook (mock in dev). */
export const inboundMessageSchema = z.object({
  channel: z.enum(channelValues),
  externalThreadId: z.string().min(1).max(200),
  externalUserId: z.string().min(1).max(200).optional(),
  text: z.string().max(4000).optional(),
  providerMessageId: z.string().max(200).optional(),
});
export type InboundMessageInput = z.infer<typeof inboundMessageSchema>;

/** Staff/AI outbound reply on a conversation. */
export const sendMessageSchema = z.object({
  text: z.string().min(1).max(4000),
  provenance: z.enum(['staff', 'ai', 'system']).default('staff'),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Toggle a conversation between AI and human handling. */
export const setAiModeSchema = z.object({ aiMode: z.boolean() });
export type SetAiModeInput = z.infer<typeof setAiModeSchema>;

/**
 * Messaging-channel bid INTENT (docs/07, rule 11). Free text becomes an intent —
 * never a bid — until explicitly confirmed and validated by the auction engine.
 */
export const createBidIntentSchema = z.object({
  auctionId: z.string().min(1),
  maxAmountMinor: z.number().int().positive(),
  channel: z.enum(channelValues).default('web'),
});
export type CreateBidIntentInput = z.infer<typeof createBidIntentSchema>;

// --- Singha AI Core (docs/10) ----------------------------------------------
// AI outputs are DERIVED records; a human explicitly applies a draft (rule 3).
export const draftListingSchema = z.object({
  assetId: z.string().min(1),
  locale: z.string().min(2).max(10).default('en'),
});
export type DraftListingInput = z.infer<typeof draftListingSchema>;

export const assistSchema = z.object({
  prompt: z.string().min(1).max(2000),
  context: z.record(z.unknown()).optional(),
});
export type AssistInput = z.infer<typeof assistSchema>;

/** Human applies an AI listing draft onto a listing (explicit, authorised). */
export const applyDraftSchema = z.object({
  listingId: z.string().min(1),
});
export type ApplyDraftInput = z.infer<typeof applyDraftSchema>;

// --- Singha Social Publisher (docs/11) -------------------------------------
export const socialPlatformValues = ['facebook', 'instagram'] as const;

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['individual', 'group']).default('individual'),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** Draft a publication for a listing (caption AI-assisted if omitted). */
export const createPublicationSchema = z.object({
  listingId: z.string().min(1),
  platform: z.enum(socialPlatformValues),
  campaignId: z.string().min(1).optional(),
  caption: z.string().max(2200).optional(),
  creativeRef: z.string().max(500).optional(),
  scheduledAt: z.string().datetime().optional(),
});
export type CreatePublicationInput = z.infer<typeof createPublicationSchema>;

// --- Singha Live (docs/08) -------------------------------------------------
export const createLiveEventSchema = z.object({
  title: z.string().min(1).max(200),
  auctionId: z.string().min(1).optional(),
});
export type CreateLiveEventInput = z.infer<typeof createLiveEventSchema>;

/**
 * A clerk/auctioneer relays a floor/phone/absentee bid into the ONE ledger on
 * behalf of a registered bidder (docs/07 — all sources, one ledger).
 */
export const floorBidSchema = z.object({
  auctionId: z.string().min(1),
  bidderCustomerId: z.string().min(1),
  maxAmountMinor: z.number().int().positive(),
  source: z.enum(['floor', 'phone', 'absentee', 'auctioneer']).default('floor'),
});
export type FloorBidInput = z.infer<typeof floorBidSchema>;

// --- Watchlist + enriched catalogue (consolidated pack docs 06/07) ----------
export const watchSchema = z.object({ listingId: z.string().min(1) });
export type WatchInput = z.infer<typeof watchSchema>;

/** Edit a listing's public content + sale-mode display config (docs 06/07). */
export const updateListingContentSchema = z.object({
  shortDescription: z.string().max(400).optional(),
  fullDescription: z.string().max(8000).optional(),
  locationCity: z.string().max(80).optional(),
  locationRegion: z.string().max(80).optional(),
  inspectionSummary: z.string().max(2000).optional(),
  collectionSummary: z.string().max(2000).optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(400).optional(),
  publicTermsRef: z.string().max(200).optional(),
  featured: z.boolean().optional(),
  guidePriceMinor: z.number().int().positive().nullable().optional(),
  showGuidePrice: z.boolean().optional(),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
});
export type UpdateListingContentInput = z.infer<typeof updateListingContentSchema>;

// --- Auction events (consolidated pack doc 06) -----------------------------
export const auctionEventTypeValues = ['timed', 'live', 'hybrid', 'sequential'] as const;
export const createAuctionEventSchema = z.object({
  publicRef,
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  eventType: z.enum(auctionEventTypeValues).default('timed'),
  startsAt: z.string().datetime().optional(),
  venue: z.string().max(200).optional(),
  locationCity: z.string().max(80).optional(),
  liveEnabled: z.boolean().default(false),
  featured: z.boolean().default(false),
});
export type CreateAuctionEventInput = z.infer<typeof createAuctionEventSchema>;

export const addEventLotSchema = z.object({
  listingId: z.string().min(1),
  sequence: z.number().int().min(1),
  lane: z.string().max(40).optional(),
  scheduledStart: z.string().datetime().optional(),
});
export type AddEventLotInput = z.infer<typeof addEventLotSchema>;

/** Query for the enriched v2 catalogue (facets/pagination/search). */
export const catalogueQuerySchema = z.object({
  category: z.string().max(40).optional(),
  saleMethod: z.enum(saleMethodValues).optional(),
  status: z.string().max(20).optional(),
  search: z.string().max(120).optional(),
  location: z.string().max(80).optional(),
  featured: z.coerce.boolean().optional(),
  endingSoon: z.coerce.boolean().optional(),
  auctionEventId: z.string().min(1).optional(),
  sort: z.enum(['ending', 'newest', 'price_asc', 'price_desc']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});
export type CatalogueQuery = z.infer<typeof catalogueQuerySchema>;
