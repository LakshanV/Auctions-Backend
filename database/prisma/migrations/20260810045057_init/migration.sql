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

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
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
ALTER TABLE "media_object" ADD CONSTRAINT "media_object_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_derivative" ADD CONSTRAINT "media_derivative_source_media_id_fkey" FOREIGN KEY ("source_media_id") REFERENCES "media_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
