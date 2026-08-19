import { z } from 'zod';
import { CATEGORY_KEYS, isSubcategoryOf } from './categories';
import { ALL_ROLES } from './rbac';
import { incotermCodes } from './logistics-domains';

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
export type MediaKind = (typeof mediaKindValues)[number];
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

export const createAssetSchema = z
  .object({
    category: z.enum(CATEGORY_KEYS),
    // §3 — optional customer-facing subcategory; validated against the category's taxonomy below.
    subcategory: z.string().max(60).optional(),
    attributes: z.record(z.unknown()).default({}),
    ownerCustomerId: z.string().min(1).optional(),
  })
  .refine((v) => !v.subcategory || isSubcategoryOf(v.category, v.subcategory), {
    message: 'subcategory is not valid for this category',
    path: ['subcategory'],
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
  // §5 — the public reference is OPTIONAL: when omitted the server assigns a unique, branded
  // Singha reference (SNG-YYYY-XXXXXXXX). A caller MAY still supply its own (staff/integration
  // import, legacy backfill); a supplied value keeps the same alphanumeric-dash constraints.
  publicRef: publicRef.optional(),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

/**
 * §5 — deterministic, collision-safe Singha listing reference derived from the listing's
 * ULID id (its tail is 80 bits of randomness, so an 8-char base32 slice is effectively unique;
 * the DB `@unique` constraint is the final backstop). Branded + human-readable + sortable by year.
 */
export function generateListingReference(id: string, year: number): string {
  return `SNG-${year}-${id.slice(-8).toUpperCase()}`;
}

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

// RW3 — authorized retrieval of PRIVATE/INTERNAL media (documents, video). A time-limited signed
// read URL; the server object-level authorizes the caller before issuing it. `expiresInSec` is
// bounded so a caller can never mint a long-lived link.
export const mediaDownloadQuerySchema = z.object({
  expiresInSec: z.coerce.number().int().min(60).max(3600).optional(),
});
export type MediaDownloadQuery = z.infer<typeof mediaDownloadQuerySchema>;

// §20 (RW9, PRV-3) — third-party inspection / certification EVIDENCE. Staff-recorded, derived
// trust records that inform a listing; never an authoritative overwrite of asset facts (rule 3)
// and never binding. Only `public` evidence is ever projected to customers.
export const inspectionEvidenceKindValues = [
  'gem_certification',
  'vehicle_inspection',
  'machinery_inspection',
  'assay',
  'general',
] as const;
export type InspectionEvidenceKind = (typeof inspectionEvidenceKindValues)[number];

export const inspectionEvidenceStatusValues = [
  'requested',
  'scheduled',
  'in_progress',
  'completed',
  'failed',
] as const;
export type InspectionEvidenceStatus = (typeof inspectionEvidenceStatusValues)[number];

export const recordInspectionEvidenceSchema = z.object({
  kind: z.enum(inspectionEvidenceKindValues),
  provider: z.string().min(1).max(120),
  status: z.enum(inspectionEvidenceStatusValues).optional(),
  // The lab/inspector's own certificate reference — recorded verbatim, never fabricated.
  certificateRef: z.string().max(200).optional(),
  // Customer-safe short outcome summary.
  summary: z.string().max(1000).optional(),
  inspectedAt: z.string().datetime().optional(),
  // Defaults to `private` server-side; set `public` to surface the evidence on the lot.
  visibility: z.enum(mediaVisibilityValues).optional(),
  // Optional link to the certificate document already registered in the secure media pipeline.
  mediaObjectId: z.string().min(1).max(200).optional(),
  // When true, the record is opened through the InspectionProvider port (gets an inspectionId +
  // provider-reported status) instead of being entered directly from an already-issued certificate.
  requestViaProvider: z.boolean().optional(),
});
export type RecordInspectionEvidenceInput = z.infer<typeof recordInspectionEvidenceSchema>;

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
  // Bound money to a safe integer: a value above MAX_SAFE_INTEGER passes `.int()` (all large
  // doubles are integer-valued) but overflows the Postgres BIGINT column → an unhandled 500.
  openingBidMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reserveMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
  reserveVisible: z.boolean().default(false),
  incrementMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  softCloseTriggerSec: z.number().int().positive().default(10),
  softCloseExtendSec: z.number().int().positive().default(20),
  buyerPremiumPct: z.number().min(0).default(0),
});
export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;

export const placeBidSchema = z.object({
  /** The bidder's PRIVATE maximum (proxy). Never exposed to other bidders. */
  maxAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
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
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
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
const money = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

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
  })
  // amountMinor is meaningful ONLY for a counter. Accepting an offer binds the Sale to the
  // buyer's ORIGINAL amount, so an amountMinor passed on accept/reject would silently diverge the
  // Offer head from the authoritative Sale — reject it rather than accept an ignored value.
  .refine((v) => v.response === 'counter' || v.amountMinor == null, {
    message: 'amountMinor is only valid when countering',
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
  otherFeesMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  depositAppliedMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
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
  deductionsMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
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
  /**
   * AIC-2 cross-channel continuity (docs/09 "one customer identity and conversation history
   * across channels"). When present, this inbound message claims to CONTINUE an assistant
   * conversation started on another channel (see `issueContinuityToken` in
   * apps/api/src/shared/auth/continuity-token.ts). It is NEVER trusted for identity by itself:
   * `ConnectService.inbound` re-resolves the customer from a `verifiedAt`-stamped
   * `ExternalIdentity` exactly as it does for every other inbound message, and only attaches to
   * the origin conversation if that resolved customer matches the origin's own `customerId`.
   */
  continuityToken: z.string().min(1).max(4000).optional(),
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
  maxAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  channel: z.enum(channelValues).default('web'),
});
export type CreateBidIntentInput = z.infer<typeof createBidIntentSchema>;

// --- Singha AI Core (docs/10) ----------------------------------------------
// AI outputs are DERIVED records; a human explicitly applies a draft (rule 3).
// Draft copy from either a persisted asset (assetId) OR the seller's in-progress confirmed facts
// (category + attributes + notes) — the Listing Studio drafts before the asset is saved (directive
// §11). Exactly one source is required. The draft is DERIVED; it never writes over asset facts.
export const draftListingSchema = z
  .object({
    assetId: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    attributes: z.record(z.unknown()).optional(),
    notes: z.string().max(4000).optional(),
    locale: z.string().min(2).max(10).default('en'),
  })
  .refine((v) => Boolean(v.assetId) || Boolean(v.category), {
    message: 'Provide either assetId or category to draft a listing',
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

/**
 * §8 — human correction/evaluation loop. A human records their verdict on an AI run's derived
 * output: they accepted it, corrected it (with the per-field before/after), or rejected it. This is
 * append-only feedback — the original AI output is never mutated (rule 3) — and it is the labelled
 * signal the evaluation summary aggregates into accuracy metrics.
 */
export const aiFeedbackOutcomes = ['accepted', 'corrected', 'rejected'] as const;
export const aiFeedbackSchema = z.object({
  outcome: z.enum(aiFeedbackOutcomes),
  /** Per-field corrections the human made, keyed by field: `{ make: { from, to } }`. */
  correctedFields: z.record(z.object({ from: z.unknown().optional(), to: z.unknown() })).optional(),
  note: z.string().max(2000).optional(),
});
export type AiFeedbackInput = z.infer<typeof aiFeedbackSchema>;

/**
 * §6/§7 — stateless pre-publish quality-check input. The seller sends the facts they have entered
 * so far (from the draft) and gets back a deterministic, ADVISORY readiness assessment. The set of
 * REQUIRED category attributes and whether the category is a divisible commodity are NOT trusted
 * from the client — the server derives them from the authoritative category schema and merges them
 * before scoring. `presentAttributeKeys` are the attribute keys the seller has filled in.
 */
export const qualityCheckInputSchema = z.object({
  saleMethod: z.enum(saleMethodValues),
  category: z.string().max(40),
  title: z.string().max(200).optional(),
  shortDescription: z.string().max(400).optional(),
  fullDescription: z.string().max(8000).optional(),
  presentAttributeKeys: z.array(z.string().max(60)).max(100).default([]),
  photoCount: z.number().int().nonnegative().default(0),
  hasCover: z.boolean().default(false),
  videoAvailable: z.boolean().optional(),
  guidePriceMinor: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .optional(),
  buyNowPriceMinor: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .optional(),
  quantityAvailable: z.number().nonnegative().nullable().optional(),
  quantityUnitCode: z.string().max(16).nullable().optional(),
  hasLocation: z.boolean().optional(),
});
export type QualityCheckInput = z.infer<typeof qualityCheckInputSchema>;

/**
 * Translate free text (docs/10 Customer AI — multilingual assistant). `text` is
 * free text, so it goes through `guardAiRequest('translation', ...)` for
 * injection detection (rule 3/12) before it ever reaches a provider. The 6000
 * ceiling mirrors `POLICIES.translation.maxInputChars` in
 * packages/domain/src/modules/ai/ai-safety.ts — kept in sync manually since
 * @singha/contracts cannot depend on @singha/domain (dependency runs the other
 * way). `targetLang`/`sourceLang` are short locale tags (e.g. 'en', 'si', 'ta')
 * rather than a fixed enum, matching `draftListingSchema.locale` — the platform
 * is architected for English/Sinhala/Tamil first but must not hard-block others.
 */
export const translateSchema = z.object({
  text: z.string().min(1).max(6000),
  targetLang: z.string().min(2).max(10),
  sourceLang: z.string().min(2).max(10).optional(),
});
export type TranslateInput = z.infer<typeof translateSchema>;

/**
 * Customer-facing AI conversation assistant (AIC-1, docs/10 "Customer AI"). Non-binding (rule
 * 11): the assistant answers/suggests only — bid/offer/EOI creation stays with the existing
 * engines behind explicit confirmation. `message` is free text, so it goes through
 * `guardAiRequest('assistant', ...)` for injection detection before it ever reaches a provider;
 * the 2000 ceiling mirrors `POLICIES.assistant.maxInputChars` in
 * packages/domain/src/modules/ai/ai-safety.ts (kept in sync manually — see the `translateSchema`
 * note above for why @singha/contracts cannot import that constant directly). `conversationId`
 * continues an existing (own) conversation; omitted, a fresh one is started. `listingId` triggers
 * assembly of a customer-safe item context (title/price-state/location/etc. — never reserve,
 * proxy max, seller floor or any other internal field). `url` is the page the customer was on,
 * purely informational context for the assistant, never authoritative.
 */
export const askAssistantSchema = z.object({
  conversationId: z.string().min(1).optional(),
  listingId: z.string().min(1).optional(),
  url: z.string().max(2000).optional(),
  message: z.string().min(1).max(2000),
});
export type AskAssistantInput = z.infer<typeof askAssistantSchema>;

/**
 * The assistant's reply. `refused` is true when the boundary guard blocked the request (prompt
 * injection / instruction override / over-length) — `reply` is then a fixed safe message and no
 * provider was ever called. `suggestions` are customer-safe LABELS only (e.g. "Make an offer",
 * "Arrange inspection") derived from the listing's sale method — never actions/links; creating a
 * bid/offer/EOI stays with the existing engines behind explicit confirmation (rule 11).
 */
export const assistantAskResponseSchema = z.object({
  conversationId: z.string().min(1),
  reply: z.string().min(1),
  refused: z.boolean(),
  suggestions: z.array(z.string()).optional(),
});
export type AssistantAskResponse = z.infer<typeof assistantAskResponseSchema>;

/**
 * AIC-2 — "Chat now / WhatsApp / Call me" channel-request (docs/09/10). The customer, mid-
 * conversation, asks the assistant to continue on a DIFFERENT channel. `channel` is deliberately
 * a 2-value enum, never the full `channelValues` set — 'web' is where the assistant already
 * lives (never "requested"), and only whatsapp/voice are hand-off targets; whether either is
 * actually offered is a config check (`assistantChannels`) done in `AssistantService`, not here.
 * `phone` is the callback/WhatsApp number; optional for both (a WhatsApp link can be issued
 * without one, and a voice request without one still records a non-binding callback intent —
 * rule "unknown business value -> configurable, never blocking").
 */
export const assistantRequestableChannelValues = ['whatsapp', 'voice'] as const;

export const assistantChannelRequestSchema = z.object({
  conversationId: z.string().min(1),
  channel: z.enum(assistantRequestableChannelValues),
  phone: z.string().min(4).max(32).optional(),
});
export type AssistantChannelRequestInput = z.infer<typeof assistantChannelRequestSchema>;

/**
 * `deepLink` is only set for `channel:'whatsapp'` (a provider-neutral continuation URL carrying
 * the continuity token); `callbackRequested` only for `channel:'voice'` (always `true` there — a
 * non-binding fake, nothing calls anyone for real). `continuityToken` is always returned: it is
 * the same link-not-credential either channel would present back to `POST /connect/inbound` (or
 * a future voice-ingress path) to resume the SAME conversation — see continuity-token.ts.
 */
export const assistantChannelRequestResponseSchema = z.object({
  channel: z.enum(assistantRequestableChannelValues),
  deepLink: z.string().optional(),
  callbackRequested: z.boolean().optional(),
  continuityToken: z.string().min(1),
});
export type AssistantChannelRequestResponse = z.infer<typeof assistantChannelRequestResponseSchema>;

/**
 * AIC-3 — AI-assisted search (docs/10 "Customer AI" search/discovery). `query` is free text, so
 * it goes through `guardAiRequest('assistant', ...)` exactly like `askAssistantSchema.message`
 * before anything ever reaches a provider — the 2000 ceiling mirrors that schema's (and
 * `POLICIES.assistant.maxInputChars`). `conversationId` is OPTIONAL and, unlike `ask()`, is
 * NEVER minted fresh here: when supplied it must be an existing conversation the caller already
 * owns (`AssistantService.search` reuses `resolveConversationId`'s ownership check, never its
 * mint-a-new-id branch) so the search's summary can be appended to it; when omitted, the search
 * simply has no conversation to attach a summary Message to. The model never receives/returns
 * this DTO directly — it only ever sees `query` (see `AiProvider.interpretSearch`).
 */
export const assistantSearchSchema = z.object({
  conversationId: z.string().min(1).optional(),
  query: z.string().min(1).max(2000),
});
export type AssistantSearchInput = z.infer<typeof assistantSearchSchema>;

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
  maxAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  source: z.enum(['floor', 'phone', 'absentee', 'auctioneer']).default('floor'),
});
export type FloorBidInput = z.infer<typeof floorBidSchema>;

// §21/§22 (RW6) — auctioneer floor state-machine ops over an AuctionEvent's ordered lots. These
// drive PRESENTATION state (which lot is on the block, going once/twice, sold/passed); the bid
// ledger stays authoritative (rule 12). Gated by `live:conduct` (auctioneer + staff).
export const openLotSchema = z.object({ lotId: z.string().min(1) });
export type OpenLotInput = z.infer<typeof openLotSchema>;

export const callStageSchema = z.object({ stage: z.enum(['going_once', 'going_twice']) });
export type CallStageInput = z.infer<typeof callStageSchema>;

export const withdrawLotSchema = z.object({ lotId: z.string().min(1) });
export type WithdrawLotInput = z.infer<typeof withdrawLotSchema>;

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
  guidePriceMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  showGuidePrice: z.boolean().optional(),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  // §2 — structured quantity + unit + unit-pricing (pack doc 13 quantity engine). Decimals are
  // carried as numbers over the wire and stored as Prisma Decimal (no float precision loss on the
  // DB side). All optional/additive; `null` clears a previously-set value, omitted leaves it as-is.
  quantityAvailable: z.number().nonnegative().nullable().optional(),
  minOrderQuantity: z.number().nonnegative().nullable().optional(),
  quantityUnitCode: z.string().max(16).nullable().optional(),
  unitPriceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  pricingBasis: z.string().max(24).nullable().optional(),
  // §11 — seller-declared logistics terms: a default trade term (Incoterm) + pickup/delivery
  // availability. The Incoterm is validated against the configurable INCOTERMS list.
  defaultIncoterm: z.enum(incotermCodes).nullable().optional(),
  pickupAvailable: z.boolean().optional(),
  deliveryAvailable: z.boolean().optional(),
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
  // §3 — filter to a customer-facing subcategory within a category.
  subcategory: z.string().max(60).optional(),
  saleMethod: z.enum(saleMethodValues).optional(),
  status: z.string().max(20).optional(),
  search: z.string().max(120).optional(),
  location: z.string().max(80).optional(),
  featured: z.coerce.boolean().optional(),
  endingSoon: z.coerce.boolean().optional(),
  auctionEventId: z.string().min(1).optional(),
  // RW4 — additive customer-safe facets over columns the listing already carries. Price is a
  // "band" filter matched against whichever commercial figure a listing actually publishes
  // (buy-now / unit / guide / live-or-opening bid); quantity/unit/pickup/delivery mirror the
  // qty + logistics columns. All optional — omitting them preserves the prior behaviour exactly.
  minPriceMinor: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  maxPriceMinor: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  minQuantity: z.coerce.number().nonnegative().optional(),
  maxQuantity: z.coerce.number().nonnegative().optional(),
  unit: z.string().min(1).max(16).optional(),
  pickup: z.coerce.boolean().optional(),
  delivery: z.coerce.boolean().optional(),
  // §19 — customer-safe trust facet: restrict to lots whose seller has completed
  // identity verification (Customer.kycStatus === 'verified'). Never exposes the
  // KYC value itself; the projection is a single boolean per card.
  verifiedOnly: z.coerce.boolean().optional(),
  sort: z.enum(['ending', 'newest', 'price_asc', 'price_desc']).default('ending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});
export type CatalogueQuery = z.infer<typeof catalogueQuerySchema>;

/**
 * Query for a single AuctionFlow/Rubik category row (pack 01 doc 05). Each row
 * owns its own cursor so category bands page INDEPENDENTLY — the catalogue is no
 * longer limited to the first global page, and every category is reachable.
 * `cursor` is the opaque id of the last loaded item; omit it for the first slice.
 */
export const catalogueRowQuerySchema = z.object({
  category: z.string().min(1).max(40),
  subcategory: z.string().max(60).optional(),
  saleMethod: z.enum(saleMethodValues).optional(),
  status: z.string().max(20).optional(),
  search: z.string().max(120).optional(),
  location: z.string().max(80).optional(),
  endingSoon: z.coerce.boolean().optional(),
  auctionEventId: z.string().min(1).optional(),
  // RW4 — same additive facets as the list query (see catalogueQuerySchema).
  minPriceMinor: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  maxPriceMinor: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  minQuantity: z.coerce.number().nonnegative().optional(),
  maxQuantity: z.coerce.number().nonnegative().optional(),
  unit: z.string().min(1).max(16).optional(),
  pickup: z.coerce.boolean().optional(),
  delivery: z.coerce.boolean().optional(),
  // §19 — same customer-safe verified-seller facet as the list query.
  verifiedOnly: z.coerce.boolean().optional(),
  sort: z.enum(['ending', 'newest', 'price_asc', 'price_desc']).default('ending'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(12),
});
export type CatalogueRowQuery = z.infer<typeof catalogueRowQuerySchema>;

// ---------------------------------------------------------------------------
// Member identity, credit, security & performance commands (Revision 05).
// The API exposes explicit COMMANDS, never a generic PATCH of sensitive credit,
// security or membership state (§12). Money is an integer count of minor units.
// ---------------------------------------------------------------------------

const moneyMinor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bps = z.number().int().min(1).max(100000);

export const securityInstrumentTypeValues = [
  'cash_deposit',
  'bank_guarantee',
  'spot_deposit',
] as const;
export const grantScopeTypeValues = ['platform', 'event', 'auction', 'category'] as const;
export const performanceContextValues = ['buyer', 'seller'] as const;
export const memberFlagContextValues = ['buyer', 'seller', 'general'] as const;
export const memberFlagSeverityValues = ['low', 'medium', 'high', 'critical'] as const;

export const submitSecurityInstrumentSchema = z.object({
  customerId: z.string().min(1),
  organizationId: z.string().min(1).optional(),
  type: z.enum(securityInstrumentTypeValues),
  currency: z.string().length(3).default('LKR'),
  faceAmountMinor: moneyMinor,
  eligibilityBps: bps.default(10000),
  reference: z.string().max(120).optional(),
  issuingBank: z.string().max(120).optional(),
  guaranteeNumber: z.string().max(120).optional(),
  issueDate: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  documentMediaId: z.string().min(1).optional(),
  notes: z.string().max(1000).optional(),
});
export type SubmitSecurityInstrumentInput = z.infer<typeof submitSecurityInstrumentSchema>;

export const verifySecurityInstrumentSchema = z.object({
  decision: z.enum(['verify', 'reject']),
  eligibilityBps: bps.optional(),
  reason: z.string().max(1000).optional(),
});
export type VerifySecurityInstrumentInput = z.infer<typeof verifySecurityInstrumentSchema>;

export const releaseSecurityInstrumentSchema = z.object({
  reason: z.string().max(1000).optional(),
});
export type ReleaseSecurityInstrumentInput = z.infer<typeof releaseSecurityInstrumentSchema>;

export const approveCreditSchema = z.object({
  customerId: z.string().min(1),
  requiredSecurityBps: bps.optional(),
  /** Manual cap on the calculated limit; omit to approve the full calculation. */
  approvedLimitMinor: moneyMinor.optional(),
  temporaryUpliftMinor: moneyMinor.optional(),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().max(1000).optional(),
  /** Optional dual-approval for high-value decisions (§15/§24). */
  secondApprover: z.string().min(1).optional(),
});
export type ApproveCreditInput = z.infer<typeof approveCreditSchema>;

export const suspendCreditSchema = z.object({
  customerId: z.string().min(1),
  reason: z.string().min(1).max(1000),
});
export type SuspendCreditInput = z.infer<typeof suspendCreditSchema>;

export const grantTemporaryMembershipSchema = z.object({
  customerId: z.string().min(1),
  scopeType: z.enum(grantScopeTypeValues),
  scopeId: z.string().min(1).optional(),
  /** Approved spot deposit backing the temporary access. */
  spotDepositMinor: moneyMinor,
  requiredSecurityBps: bps.default(500),
  /** Optional staff cap on the calculated temporary capacity. */
  approvedLimitMinor: moneyMinor.optional(),
  expiresAt: z.string().datetime(),
  reason: z.string().max(1000).optional(),
});
export type GrantTemporaryMembershipInput = z.infer<typeof grantTemporaryMembershipSchema>;

export const setMembershipStatusSchema = z.object({
  customerId: z.string().min(1),
  status: z.enum(['active', 'suspended', 'blocked', 'expired']),
  reason: z.string().max(1000).optional(),
});
export type SetMembershipStatusInput = z.infer<typeof setMembershipStatusSchema>;

export const createMemberFlagSchema = z.object({
  customerId: z.string().min(1),
  context: z.enum(memberFlagContextValues).default('general'),
  category: z.string().min(1).max(60),
  severity: z.enum(memberFlagSeverityValues).default('low'),
  reasonCode: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  privateNote: z.string().max(2000).optional(),
  evidence: z.array(z.string().min(1)).default([]),
  expiresAt: z.string().datetime().optional(),
});
export type CreateMemberFlagInput = z.infer<typeof createMemberFlagSchema>;

export const resolveMemberFlagSchema = z.object({
  resolution: z.enum(['resolve', 'dismiss']),
  note: z.string().max(2000).optional(),
});
export type ResolveMemberFlagInput = z.infer<typeof resolveMemberFlagSchema>;

export const recordPerformanceEventSchema = z.object({
  customerId: z.string().min(1),
  context: z.enum(performanceContextValues),
  eventType: z.string().min(1).max(60),
  dimension: z.string().min(1).max(60),
  value: z.number().default(1),
  sourceEntityType: z.string().max(60).optional(),
  sourceEntityId: z.string().min(1).optional(),
});
export type RecordPerformanceEventInput = z.infer<typeof recordPerformanceEventSchema>;

// --- Seller persistence (directive §25 / §7) --------------------------------
// Server-authoritative Listing Studio drafts + requested auction settings. The UI
// is never the source of truth: drafts follow the seller across devices, and auction
// preferences are a staff-approvable request, not the live auction.

/** Create/save a resumable seller draft. `expectedVersion` enables optimistic-
 * concurrency conflict detection on save (omit on create). */
export const sellerDraftUpsertSchema = z.object({
  title: z.string().max(200).optional(),
  payload: z.record(z.unknown()),
  mediaState: z.record(z.unknown()).optional(),
  aiProvenance: z.record(z.unknown()).optional(),
  schemaVersion: z.number().int().positive().max(1000).default(1),
  expectedVersion: z.number().int().positive().optional(),
});
export type SellerDraftUpsertInput = z.infer<typeof sellerDraftUpsertSchema>;

const minorAmount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** A seller's requested auction settings for a listing (minor units). Advisory —
 * staff validate + create the authoritative auction. */
export const sellerAuctionPreferenceSchema = z.object({
  openingBidMinor: minorAmount.optional(),
  reserveMinor: minorAmount.optional(),
  incrementMinor: minorAmount.optional(),
  currency: z.string().min(3).max(3).optional(),
  preferredOpenAt: z.string().datetime().optional(),
  preferredCloseAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type SellerAuctionPreferenceInput = z.infer<typeof sellerAuctionPreferenceSchema>;

// ── Singha CRM (staff operations) DTOs (CRM completion pass) ──────────────────
export const crmSubjectTypeValues = [
  'customer',
  'organization',
  'listing',
  'auction',
  'sale',
  'conversation',
  'shipment',
  'procurement_request',
] as const;
export const crmTaskTypeValues = [
  'call',
  'follow_up',
  'document_request',
  'quality_review',
  'post_win_contact',
  'shipment_delay',
  'payment_action',
  'rfq_review',
  'inspection',
  'general',
] as const;
export const crmTaskPriorityValues = ['low', 'normal', 'high', 'urgent'] as const;
export const crmTaskStatusValues = ['open', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export const crmNoteVisibilityValues = ['staff', 'restricted'] as const;

const crmId = z.string().min(1).max(200);

export const createCrmNoteSchema = z.object({
  subjectType: z.enum(crmSubjectTypeValues),
  subjectId: crmId,
  body: z.string().min(1).max(5000),
  visibility: z.enum(crmNoteVisibilityValues).default('staff'),
});
export type CreateCrmNoteInput = z.infer<typeof createCrmNoteSchema>;

export const createCrmTaskSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    type: z.enum(crmTaskTypeValues).default('general'),
    priority: z.enum(crmTaskPriorityValues).default('normal'),
    customerId: crmId.optional(),
    organizationId: crmId.optional(),
    listingId: crmId.optional(),
    auctionId: crmId.optional(),
    saleId: crmId.optional(),
    conversationId: crmId.optional(),
    shipmentId: crmId.optional(),
    assigneeId: crmId.optional(),
    team: z.string().max(80).optional(),
    dueAt: z.string().datetime().optional(),
    remindAt: z.string().datetime().optional(),
    source: z.enum(['human', 'ai_suggested']).default('human'),
    sensitive: z.boolean().default(false),
  })
  .refine(
    (v) =>
      Boolean(
        v.customerId ||
        v.organizationId ||
        v.listingId ||
        v.auctionId ||
        v.saleId ||
        v.conversationId ||
        v.shipmentId,
      ),
    { message: 'a task must link at least one subject', path: ['customerId'] },
  );
export type CreateCrmTaskInput = z.infer<typeof createCrmTaskSchema>;

export const updateCrmTaskSchema = z
  .object({
    status: z.enum(crmTaskStatusValues).optional(),
    priority: z.enum(crmTaskPriorityValues).optional(),
    assigneeId: crmId.nullable().optional(),
    team: z.string().max(80).nullable().optional(),
    dueAt: z.string().datetime().nullable().optional(),
    remindAt: z.string().datetime().nullable().optional(),
    result: z.string().max(5000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'no fields to update',
  });
export type UpdateCrmTaskInput = z.infer<typeof updateCrmTaskSchema>;

export const listCrmTasksQuerySchema = z.object({
  status: z.enum(crmTaskStatusValues).optional(),
  assigneeId: z.string().max(200).optional(),
  customerId: z.string().max(200).optional(),
  type: z.enum(crmTaskTypeValues).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListCrmTasksQuery = z.infer<typeof listCrmTasksQuerySchema>;

export const listCrmNotesQuerySchema = z.object({
  subjectType: z.enum(crmSubjectTypeValues),
  subjectId: crmId,
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListCrmNotesQuery = z.infer<typeof listCrmNotesQuerySchema>;

/**
 * Staff CRM customer timeline (completion pass §18) — a bounded, chronological read over the
 * authoritative records. It is a PROJECTION, never a second ledger, so it only takes a limit.
 */
export const crmTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type CrmTimelineQuery = z.infer<typeof crmTimelineQuerySchema>;
