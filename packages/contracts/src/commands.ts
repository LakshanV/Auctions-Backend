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

export const registerMediaSchema = z.object({
  kind: z.enum(mediaKindValues),
  storageKey: z.string().min(1).max(500),
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
