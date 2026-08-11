-- ============================================================================
-- Singha Auctions V2 — COMPLETE schema in ONE script.
-- Run once against an EMPTY Postgres/Supabase database (psql or SQL editor).
-- Equals applying every Prisma migration + the append-only triggers
-- (audit_event, bid, ledger_entry) that guarantee immutable history.
-- ============================================================================

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('prospect', 'active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('none', 'pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('web', 'whatsapp', 'facebook', 'instagram', 'email', 'sms');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('owner', 'admin', 'staff');

-- CreateEnum
CREATE TYPE "AssetLifecycle" AS ENUM ('draft', 'in_intake', 'available', 'reserved', 'sold', 'withdrawn', 'archived');

-- CreateEnum
CREATE TYPE "SaleMethod" AS ENUM ('TIMED_AUCTION', 'EXPRESSION_OF_INTEREST', 'BUY_NOW', 'MAKE_OFFER', 'SEALED_TENDER', 'LIVE_HYBRID');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'submitted', 'review', 'changes_required', 'approved', 'scheduled', 'live', 'ended', 'sold', 'unsold', 'withdrawn');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('image', 'video', 'document', 'video_thumbnail');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('uploading', 'processing', 'ready', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('customer', 'staff', 'system', 'ai');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'dispatched', 'failed');

-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('auction', 'eoi', 'buy_now', 'make_offer', 'sealed_tender', 'live');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('open', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired');

-- CreateEnum
CREATE TYPE "OfferEventType" AS ENUM ('offer', 'counter', 'accept', 'reject', 'withdraw', 'expire');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('scheduled', 'open', 'paused', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "BidSource" AS ENUM ('online', 'floor', 'phone', 'absentee', 'proxy', 'auctioneer');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('accepted', 'rejected', 'reversed');

-- CreateEnum
CREATE TYPE "EoiStatus" AS ENUM ('submitted', 'under_review', 'shortlisted', 'negotiating', 'accepted', 'declined', 'withdrawn', 'expired');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('issued', 'paid', 'void');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('deposit_received', 'sale_charge', 'buyer_premium', 'tax', 'payment_received', 'refund', 'credit_applied', 'settlement_disbursed');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending_verification', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "FulfilmentState" AS ENUM ('payment_pending', 'payment_confirmed', 'release_approved', 'ready_for_pickup', 'pickup_booked', 'in_delivery', 'collected', 'delivered', 'completed');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'pending', 'closed');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageProvenance" AS ENUM ('customer', 'staff', 'ai', 'system');

-- CreateEnum
CREATE TYPE "BidIntentStatus" AS ENUM ('pending', 'confirmed', 'placed', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "AiTaskType" AS ENUM ('listing_draft', 'media_caption', 'assistant', 'translation', 'recommendation', 'support');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('facebook', 'instagram');

-- CreateEnum
CREATE TYPE "SocialPublicationStatus" AS ENUM ('draft', 'scheduled', 'published', 'failed');

-- CreateEnum
CREATE TYPE "SocialCampaignType" AS ENUM ('individual', 'group');

-- CreateEnum
CREATE TYPE "LiveStatus" AS ENUM ('scheduled', 'live', 'paused', 'ended');

-- CreateTable
CREATE TABLE "customer" (
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
CREATE TABLE "external_identity" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "public_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_member" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'staff',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
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
CREATE TABLE "listing" (
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

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale" (
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
CREATE TABLE "offer" (
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
CREATE TABLE "offer_event" (
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
CREATE TABLE "tender_bid" (
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
CREATE TABLE "media_object" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'uploading',
    "is_original" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_object_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_derivative" (
    "id" TEXT NOT NULL,
    "source_media_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_derivative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
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
CREATE TABLE "outbox_event" (
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
CREATE TABLE "idempotency_record" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "result_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "approval_required" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction" (
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
CREATE TABLE "bid" (
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
CREATE TABLE "bidder_max" (
    "id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "bidder_id" TEXT NOT NULL,
    "max_minor" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bidder_max_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eoi" (
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
CREATE TABLE "eoi_event" (
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
CREATE TABLE "invoice" (
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
CREATE TABLE "ledger_entry" (
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
CREATE TABLE "payment" (
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
CREATE TABLE "fulfilment" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "state" "FulfilmentState" NOT NULL DEFAULT 'payment_pending',
    "release_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfilment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement" (
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
CREATE TABLE "conversation" (
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
CREATE TABLE "message" (
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
CREATE TABLE "bid_intent" (
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
CREATE TABLE "ai_run" (
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
CREATE TABLE "social_campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SocialCampaignType" NOT NULL DEFAULT 'individual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_publication" (
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
CREATE TABLE "live_event" (
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
CREATE UNIQUE INDEX "customer_email_key" ON "customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customer_phone_key" ON "customer"("phone");

-- CreateIndex
CREATE INDEX "external_identity_customer_id_idx" ON "external_identity"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_identity_channel_external_id_key" ON "external_identity"("channel", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_public_ref_key" ON "organization"("public_ref");

-- CreateIndex
CREATE INDEX "organization_member_customer_id_idx" ON "organization_member"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_member_organization_id_customer_id_key" ON "organization_member"("organization_id", "customer_id");

-- CreateIndex
CREATE INDEX "asset_category_idx" ON "asset"("category");

-- CreateIndex
CREATE INDEX "asset_owner_customer_id_idx" ON "asset"("owner_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_public_ref_key" ON "listing"("public_ref");

-- CreateIndex
CREATE INDEX "listing_asset_id_idx" ON "listing"("asset_id");

-- CreateIndex
CREATE INDEX "listing_status_idx" ON "listing"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sale_listing_id_key" ON "sale"("listing_id");

-- CreateIndex
CREATE INDEX "sale_buyer_customer_id_idx" ON "sale"("buyer_customer_id");

-- CreateIndex
CREATE INDEX "offer_listing_id_idx" ON "offer"("listing_id");

-- CreateIndex
CREATE INDEX "offer_customer_id_idx" ON "offer"("customer_id");

-- CreateIndex
CREATE INDEX "offer_event_offer_id_idx" ON "offer_event"("offer_id");

-- CreateIndex
CREATE INDEX "tender_bid_listing_id_idx" ON "tender_bid"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "tender_bid_listing_id_customer_id_key" ON "tender_bid"("listing_id", "customer_id");

-- CreateIndex
CREATE INDEX "media_object_asset_id_idx" ON "media_object"("asset_id");

-- CreateIndex
CREATE INDEX "media_derivative_source_media_id_idx" ON "media_derivative"("source_media_id");

-- CreateIndex
CREATE INDEX "audit_event_target_type_target_id_idx" ON "audit_event"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_event_correlation_id_idx" ON "audit_event"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_event_event_id_key" ON "outbox_event"("event_id");

-- CreateIndex
CREATE INDEX "outbox_event_status_created_at_idx" ON "outbox_event"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_key_key" ON "idempotency_record"("key");

-- CreateIndex
CREATE INDEX "idempotency_record_scope_idx" ON "idempotency_record"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_key_key" ON "feature_flag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "business_config_key_key" ON "business_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "auction_listing_id_key" ON "auction"("listing_id");

-- CreateIndex
CREATE INDEX "auction_status_ends_at_idx" ON "auction"("status", "ends_at");

-- CreateIndex
CREATE INDEX "bid_auction_id_idx" ON "bid"("auction_id");

-- CreateIndex
CREATE UNIQUE INDEX "bid_auction_id_sequence_key" ON "bid"("auction_id", "sequence");

-- CreateIndex
CREATE INDEX "bidder_max_auction_id_idx" ON "bidder_max"("auction_id");

-- CreateIndex
CREATE UNIQUE INDEX "bidder_max_auction_id_bidder_id_key" ON "bidder_max"("auction_id", "bidder_id");

-- CreateIndex
CREATE INDEX "eoi_listing_id_idx" ON "eoi"("listing_id");

-- CreateIndex
CREATE INDEX "eoi_customer_id_idx" ON "eoi"("customer_id");

-- CreateIndex
CREATE INDEX "eoi_status_idx" ON "eoi"("status");

-- CreateIndex
CREATE INDEX "eoi_event_eoi_id_idx" ON "eoi_event"("eoi_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_number_key" ON "invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_listing_id_key" ON "invoice"("listing_id");

-- CreateIndex
CREATE INDEX "invoice_buyer_customer_id_idx" ON "invoice"("buyer_customer_id");

-- CreateIndex
CREATE INDEX "ledger_entry_listing_id_idx" ON "ledger_entry"("listing_id");

-- CreateIndex
CREATE INDEX "ledger_entry_invoice_id_idx" ON "ledger_entry"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_invoice_id_idx" ON "payment"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_listing_id_key" ON "fulfilment"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_listing_id_key" ON "settlement"("listing_id");

-- CreateIndex
CREATE INDEX "conversation_customer_id_idx" ON "conversation"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_channel_external_thread_id_key" ON "conversation"("channel", "external_thread_id");

-- CreateIndex
CREATE INDEX "message_conversation_id_idx" ON "message"("conversation_id");

-- CreateIndex
CREATE INDEX "bid_intent_customer_id_idx" ON "bid_intent"("customer_id");

-- CreateIndex
CREATE INDEX "bid_intent_auction_id_idx" ON "bid_intent"("auction_id");

-- CreateIndex
CREATE INDEX "ai_run_subject_type_subject_id_idx" ON "ai_run"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "ai_run_task_type_idx" ON "ai_run"("task_type");

-- CreateIndex
CREATE INDEX "social_publication_listing_id_idx" ON "social_publication"("listing_id");

-- CreateIndex
CREATE INDEX "social_publication_campaign_id_idx" ON "social_publication"("campaign_id");

-- CreateIndex
CREATE INDEX "social_publication_status_idx" ON "social_publication"("status");

-- CreateIndex
CREATE INDEX "live_event_auction_id_idx" ON "live_event"("auction_id");

-- AddForeignKey
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_customer_id_fkey" FOREIGN KEY ("owner_customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_event" ADD CONSTRAINT "offer_event_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_bid" ADD CONSTRAINT "tender_bid_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_object" ADD CONSTRAINT "media_object_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_derivative" ADD CONSTRAINT "media_derivative_source_media_id_fkey" FOREIGN KEY ("source_media_id") REFERENCES "media_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction" ADD CONSTRAINT "auction_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid" ADD CONSTRAINT "bid_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bidder_max" ADD CONSTRAINT "bidder_max_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eoi" ADD CONSTRAINT "eoi_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eoi_event" ADD CONSTRAINT "eoi_event_eoi_id_fkey" FOREIGN KEY ("eoi_id") REFERENCES "eoi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment" ADD CONSTRAINT "fulfilment_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_publication" ADD CONSTRAINT "social_publication_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "social_campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Append-only guarantees (docs/04, docs/14, docs/15): reject UPDATE/DELETE.
-- ---------------------------------------------------------------------------

-- Append-only audit log (docs/04, docs/15): audit_event is business evidence.
-- Reject UPDATE and DELETE at the database so no application path — and no
-- ordinary admin — can rewrite or erase audit history. New rows only.

CREATE OR REPLACE FUNCTION singha_audit_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_no_update
  BEFORE UPDATE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION singha_audit_append_only();

CREATE TRIGGER audit_event_no_delete
  BEFORE DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION singha_audit_append_only();

-- Append-only bid ledger (docs/04, docs/07): accepted bids are never silently
-- rewritten. Reject UPDATE and DELETE on the bid table; corrections are new
-- reversal rows. Mirrors the audit_event append-only guarantee.

CREATE OR REPLACE FUNCTION singha_bid_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'bid ledger is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bid_no_update
  BEFORE UPDATE ON "bid"
  FOR EACH ROW EXECUTE FUNCTION singha_bid_append_only();

CREATE TRIGGER bid_no_delete
  BEFORE DELETE ON "bid"
  FOR EACH ROW EXECUTE FUNCTION singha_bid_append_only();

CREATE OR REPLACE FUNCTION singha_ledger_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'financial ledger is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_no_update
  BEFORE UPDATE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION singha_ledger_append_only();

CREATE TRIGGER ledger_entry_no_delete
  BEFORE DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION singha_ledger_append_only();
