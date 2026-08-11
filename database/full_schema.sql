-- ============================================================================
-- Singha Auctions V2 — COMPLETE schema, IDEMPOTENT.
-- Safe to run on an EMPTY database OR one that already has (some of) it:
-- enums/constraints are guarded, tables/indexes use IF NOT EXISTS, triggers
-- are dropped-then-created. Running it twice is a no-op the second time.
-- ============================================================================

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CustomerStatus" AS ENUM ('prospect', 'active', 'suspended', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "KycStatus" AS ENUM ('none', 'pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ChannelType" AS ENUM ('web', 'whatsapp', 'facebook', 'instagram', 'email', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OrgRole" AS ENUM ('owner', 'admin', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AssetLifecycle" AS ENUM ('draft', 'in_intake', 'available', 'reserved', 'sold', 'withdrawn', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SaleMethod" AS ENUM ('TIMED_AUCTION', 'EXPRESSION_OF_INTEREST', 'BUY_NOW', 'MAKE_OFFER', 'SEALED_TENDER', 'LIVE_HYBRID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ListingStatus" AS ENUM ('draft', 'submitted', 'review', 'changes_required', 'approved', 'scheduled', 'live', 'ended', 'sold', 'unsold', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MediaKind" AS ENUM ('image', 'video', 'document', 'video_thumbnail');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MediaStatus" AS ENUM ('uploading', 'processing', 'ready', 'failed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ActorType" AS ENUM ('customer', 'staff', 'system', 'ai');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'dispatched', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuctionEventType" AS ENUM ('timed', 'live', 'hybrid', 'sequential');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuctionEventStatus" AS ENUM ('draft', 'scheduled', 'live', 'ended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SaleChannel" AS ENUM ('auction', 'eoi', 'buy_now', 'make_offer', 'sealed_tender', 'live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OfferStatus" AS ENUM ('open', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OfferEventType" AS ENUM ('offer', 'counter', 'accept', 'reject', 'withdraw', 'expire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuctionStatus" AS ENUM ('scheduled', 'open', 'paused', 'closed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BidSource" AS ENUM ('online', 'floor', 'phone', 'absentee', 'proxy', 'auctioneer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BidStatus" AS ENUM ('accepted', 'rejected', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EoiStatus" AS ENUM ('submitted', 'under_review', 'shortlisted', 'negotiating', 'accepted', 'declined', 'withdrawn', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('issued', 'paid', 'void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LedgerEntryType" AS ENUM ('deposit_received', 'sale_charge', 'buyer_premium', 'tax', 'payment_received', 'refund', 'credit_applied', 'settlement_disbursed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('pending_verification', 'confirmed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FulfilmentState" AS ENUM ('payment_pending', 'payment_confirmed', 'release_approved', 'ready_for_pickup', 'pickup_booked', 'in_delivery', 'collected', 'delivered', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ConversationStatus" AS ENUM ('open', 'pending', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MessageProvenance" AS ENUM ('customer', 'staff', 'ai', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BidIntentStatus" AS ENUM ('pending', 'confirmed', 'placed', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AiTaskType" AS ENUM ('listing_draft', 'media_caption', 'assistant', 'translation', 'recommendation', 'support');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SocialPlatform" AS ENUM ('facebook', 'instagram');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SocialPublicationStatus" AS ENUM ('draft', 'scheduled', 'published', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SocialCampaignType" AS ENUM ('individual', 'group');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LiveStatus" AS ENUM ('scheduled', 'live', 'paused', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "customer" (
    "id" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'prospect',
    "legal_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'none',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "external_identity" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "organization" (
    "id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "public_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "organization_member" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'staff',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "asset" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "attributes" JSONB,
    "lifecycle" "AssetLifecycle" NOT NULL DEFAULT 'draft',
    "owner_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "listing" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "sale_method" "SaleMethod" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'draft',
    "public_ref" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "buy_now_price_minor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "short_description" TEXT,
    "full_description" TEXT,
    "location_city" TEXT,
    "location_region" TEXT,
    "inspection_summary" TEXT,
    "collection_summary" TEXT,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "public_terms_ref" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "guide_price_minor" BIGINT,
    "show_guide_price" BOOLEAN NOT NULL DEFAULT false,
    "opens_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "watch" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "auction_event" (
    "id" TEXT NOT NULL,
    "public_ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "event_type" "AuctionEventType" NOT NULL DEFAULT 'timed',
    "status" "AuctionEventStatus" NOT NULL DEFAULT 'draft',
    "starts_at" TIMESTAMP(3),
    "venue" TEXT,
    "location_city" TEXT,
    "hero_media_id" TEXT,
    "terms_ref" TEXT,
    "inspection_info" TEXT,
    "live_enabled" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auction_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "auction_event_lot" (
    "id" TEXT NOT NULL,
    "auction_event_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "lane" TEXT,
    "scheduled_start" TIMESTAMP(3),

    CONSTRAINT "auction_event_lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sale" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "buyer_customer_id" TEXT NOT NULL,
    "channel" "SaleChannel" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "offer" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'open',
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "offer_event" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "type" "OfferEventType" NOT NULL,
    "amount_minor" BIGINT,
    "note" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tender_bid" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "opened_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "media_object" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'uploading',
    "is_original" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "checksum" TEXT,

    CONSTRAINT "media_object_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "media_derivative" (
    "id" TEXT NOT NULL,
    "source_media_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_derivative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_event" (
    "id" TEXT NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "outbox_event" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "causation_id" TEXT,
    "payload" JSONB NOT NULL,
    "payload_version" INTEGER NOT NULL DEFAULT 1,
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "dispatched_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "idempotency_record" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "result_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "feature_flag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "business_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "approval_required" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "auction" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'scheduled',
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "opening_bid_minor" BIGINT NOT NULL,
    "reserve_minor" BIGINT,
    "reserve_visible" BOOLEAN NOT NULL DEFAULT false,
    "increment_minor" BIGINT NOT NULL,
    "soft_close_trigger_sec" INTEGER NOT NULL DEFAULT 10,
    "soft_close_extend_sec" INTEGER NOT NULL DEFAULT 20,
    "buyer_premium_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "current_bid_minor" BIGINT,
    "high_bidder_id" TEXT,
    "high_bid_id" TEXT,
    "extended_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "winner_customer_id" TEXT,
    "sold_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "bid" (
    "id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "bidder_id" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "source" "BidSource" NOT NULL DEFAULT 'online',
    "status" "BidStatus" NOT NULL DEFAULT 'accepted',
    "idempotency_key" TEXT,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "bidder_max" (
    "id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "bidder_id" TEXT NOT NULL,
    "max_minor" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bidder_max_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "eoi" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "EoiStatus" NOT NULL DEFAULT 'submitted',
    "amount_minor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "message" TEXT,
    "conditions" TEXT,
    "expires_at" TIMESTAMP(3),
    "review_note" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eoi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "eoi_event" (
    "id" TEXT NOT NULL,
    "eoi_id" TEXT NOT NULL,
    "from_status" "EoiStatus" NOT NULL,
    "to_status" "EoiStatus" NOT NULL,
    "note" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eoi_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "buyer_customer_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "hammer_minor" BIGINT NOT NULL,
    "buyer_premium_minor" BIGINT NOT NULL,
    "tax_minor" BIGINT NOT NULL,
    "other_fees_minor" BIGINT NOT NULL DEFAULT 0,
    "deposit_applied_minor" BIGINT NOT NULL DEFAULT 0,
    "amount_due_minor" BIGINT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'issued',
    "due_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ledger_entry" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "reference" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'bank_transfer',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending_verification',
    "proof_ref" TEXT,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "fulfilment" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "state" "FulfilmentState" NOT NULL DEFAULT 'payment_pending',
    "release_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfilment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "settlement" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "sale_proceeds_minor" BIGINT NOT NULL,
    "commission_minor" BIGINT NOT NULL,
    "commission_tax_minor" BIGINT NOT NULL,
    "deductions_minor" BIGINT NOT NULL DEFAULT 0,
    "net_minor" BIGINT NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "conversation" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "channel" "ChannelType" NOT NULL,
    "external_thread_id" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "ai_mode" BOOLEAN NOT NULL DEFAULT true,
    "assigned_agent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "provider_message_id" TEXT,
    "sender" TEXT,
    "text" TEXT,
    "payload" JSONB,
    "provenance" "MessageProvenance" NOT NULL DEFAULT 'customer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "bid_intent" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "max_amount_minor" BIGINT NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'web',
    "status" "BidIntentStatus" NOT NULL DEFAULT 'pending',
    "bid_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "bid_intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ai_run" (
    "id" TEXT NOT NULL,
    "task_type" "AiTaskType" NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "actor_id" TEXT,
    "subject_type" TEXT,
    "subject_id" TEXT,
    "prompt" TEXT,
    "output" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "applied_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "social_campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SocialCampaignType" NOT NULL DEFAULT 'individual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "social_publication" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT,
    "campaign_id" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "status" "SocialPublicationStatus" NOT NULL DEFAULT 'draft',
    "caption" TEXT NOT NULL,
    "creative_ref" TEXT,
    "ai_run_id" TEXT,
    "external_post_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "live_event" (
    "id" TEXT NOT NULL,
    "auction_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "LiveStatus" NOT NULL DEFAULT 'scheduled',
    "ingest_provider" TEXT NOT NULL DEFAULT 'mock',
    "ingest_url" TEXT,
    "playback_url" TEXT,
    "simulcast_url" TEXT,
    "recording_url" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "customer_email_key" ON "customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "customer_phone_key" ON "customer"("phone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "external_identity_customer_id_idx" ON "external_identity"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "external_identity_channel_external_id_key" ON "external_identity"("channel", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "organization_public_ref_key" ON "organization"("public_ref");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "organization_member_customer_id_idx" ON "organization_member"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "organization_member_organization_id_customer_id_key" ON "organization_member"("organization_id", "customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "asset_category_idx" ON "asset"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "asset_owner_customer_id_idx" ON "asset"("owner_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "listing_public_ref_key" ON "listing"("public_ref");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "listing_asset_id_idx" ON "listing"("asset_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "listing_status_idx" ON "listing"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "listing_featured_idx" ON "listing"("featured");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "watch_customer_id_idx" ON "watch"("customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "watch_listing_id_idx" ON "watch"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "watch_customer_id_listing_id_key" ON "watch"("customer_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "auction_event_public_ref_key" ON "auction_event"("public_ref");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "auction_event_status_idx" ON "auction_event"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "auction_event_featured_idx" ON "auction_event"("featured");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "auction_event_lot_listing_id_idx" ON "auction_event_lot"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "auction_event_lot_auction_event_id_listing_id_key" ON "auction_event_lot"("auction_event_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "auction_event_lot_auction_event_id_sequence_key" ON "auction_event_lot"("auction_event_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sale_listing_id_key" ON "sale"("listing_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sale_buyer_customer_id_idx" ON "sale"("buyer_customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "offer_listing_id_idx" ON "offer"("listing_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "offer_customer_id_idx" ON "offer"("customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "offer_event_offer_id_idx" ON "offer_event"("offer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tender_bid_listing_id_idx" ON "tender_bid"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tender_bid_listing_id_customer_id_key" ON "tender_bid"("listing_id", "customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "media_object_asset_id_idx" ON "media_object"("asset_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "media_object_asset_id_sort_order_idx" ON "media_object"("asset_id", "sort_order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "media_derivative_source_media_id_idx" ON "media_derivative"("source_media_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_event_target_type_target_id_idx" ON "audit_event"("target_type", "target_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_event_correlation_id_idx" ON "audit_event"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "outbox_event_event_id_key" ON "outbox_event"("event_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "outbox_event_status_created_at_idx" ON "outbox_event"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_record_key_key" ON "idempotency_record"("key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idempotency_record_scope_idx" ON "idempotency_record"("scope");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "feature_flag_key_key" ON "feature_flag"("key");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "business_config_key_key" ON "business_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "auction_listing_id_key" ON "auction"("listing_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "auction_status_ends_at_idx" ON "auction"("status", "ends_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bid_auction_id_idx" ON "bid"("auction_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "bid_auction_id_sequence_key" ON "bid"("auction_id", "sequence");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bidder_max_auction_id_idx" ON "bidder_max"("auction_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "bidder_max_auction_id_bidder_id_key" ON "bidder_max"("auction_id", "bidder_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "eoi_listing_id_idx" ON "eoi"("listing_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "eoi_customer_id_idx" ON "eoi"("customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "eoi_status_idx" ON "eoi"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "eoi_event_eoi_id_idx" ON "eoi_event"("eoi_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_number_key" ON "invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_listing_id_key" ON "invoice"("listing_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_buyer_customer_id_idx" ON "invoice"("buyer_customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ledger_entry_listing_id_idx" ON "ledger_entry"("listing_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ledger_entry_invoice_id_idx" ON "ledger_entry"("invoice_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_invoice_id_idx" ON "payment"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "fulfilment_listing_id_key" ON "fulfilment"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_listing_id_key" ON "settlement"("listing_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversation_customer_id_idx" ON "conversation"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_channel_external_thread_id_key" ON "conversation"("channel", "external_thread_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "message_conversation_id_idx" ON "message"("conversation_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bid_intent_customer_id_idx" ON "bid_intent"("customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bid_intent_auction_id_idx" ON "bid_intent"("auction_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_run_subject_type_subject_id_idx" ON "ai_run"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_run_task_type_idx" ON "ai_run"("task_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "social_publication_listing_id_idx" ON "social_publication"("listing_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "social_publication_campaign_id_idx" ON "social_publication"("campaign_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "social_publication_status_idx" ON "social_publication"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "live_event_auction_id_idx" ON "live_event"("auction_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_customer_id_fkey" FOREIGN KEY ("owner_customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "listing" ADD CONSTRAINT "listing_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "watch" ADD CONSTRAINT "watch_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "auction_event_lot" ADD CONSTRAINT "auction_event_lot_auction_event_id_fkey" FOREIGN KEY ("auction_event_id") REFERENCES "auction_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "auction_event_lot" ADD CONSTRAINT "auction_event_lot_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "sale" ADD CONSTRAINT "sale_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "offer" ADD CONSTRAINT "offer_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "offer_event" ADD CONSTRAINT "offer_event_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tender_bid" ADD CONSTRAINT "tender_bid_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "media_object" ADD CONSTRAINT "media_object_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "media_derivative" ADD CONSTRAINT "media_derivative_source_media_id_fkey" FOREIGN KEY ("source_media_id") REFERENCES "media_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "auction" ADD CONSTRAINT "auction_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "bid" ADD CONSTRAINT "bid_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "bidder_max" ADD CONSTRAINT "bidder_max_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "eoi" ADD CONSTRAINT "eoi_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "eoi_event" ADD CONSTRAINT "eoi_event_eoi_id_fkey" FOREIGN KEY ("eoi_id") REFERENCES "eoi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "invoice" ADD CONSTRAINT "invoice_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "fulfilment" ADD CONSTRAINT "fulfilment_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "settlement" ADD CONSTRAINT "settlement_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "social_publication" ADD CONSTRAINT "social_publication_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "social_campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;



-- ---------------------------------------------------------------------------
-- Append-only guarantees (docs/04, docs/14, docs/15): reject UPDATE/DELETE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION singha_audit_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only: % is not permitted', TG_OP USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_event_no_update ON "audit_event";
CREATE TRIGGER audit_event_no_update BEFORE UPDATE ON "audit_event" FOR EACH ROW EXECUTE FUNCTION singha_audit_append_only();
DROP TRIGGER IF EXISTS audit_event_no_delete ON "audit_event";
CREATE TRIGGER audit_event_no_delete BEFORE DELETE ON "audit_event" FOR EACH ROW EXECUTE FUNCTION singha_audit_append_only();

CREATE OR REPLACE FUNCTION singha_bid_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'bid ledger is append-only: % is not permitted', TG_OP USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bid_no_update ON "bid";
CREATE TRIGGER bid_no_update BEFORE UPDATE ON "bid" FOR EACH ROW EXECUTE FUNCTION singha_bid_append_only();
DROP TRIGGER IF EXISTS bid_no_delete ON "bid";
CREATE TRIGGER bid_no_delete BEFORE DELETE ON "bid" FOR EACH ROW EXECUTE FUNCTION singha_bid_append_only();

CREATE OR REPLACE FUNCTION singha_ledger_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'financial ledger is append-only: % is not permitted', TG_OP USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ledger_entry_no_update ON "ledger_entry";
CREATE TRIGGER ledger_entry_no_update BEFORE UPDATE ON "ledger_entry" FOR EACH ROW EXECUTE FUNCTION singha_ledger_append_only();
DROP TRIGGER IF EXISTS ledger_entry_no_delete ON "ledger_entry";
CREATE TRIGGER ledger_entry_no_delete BEFORE DELETE ON "ledger_entry" FOR EACH ROW EXECUTE FUNCTION singha_ledger_append_only();
