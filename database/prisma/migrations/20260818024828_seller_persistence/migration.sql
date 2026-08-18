-- CreateEnum
CREATE TYPE "SellerDraftStatus" AS ENUM ('active', 'submitted', 'archived');

-- CreateEnum
CREATE TYPE "SellerAuctionPrefStatus" AS ENUM ('requested', 'approved', 'rejected', 'superseded');

-- CreateTable
CREATE TABLE "seller_listing_draft" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SellerDraftStatus" NOT NULL DEFAULT 'active',
    "title" TEXT,
    "payload" JSONB NOT NULL,
    "media_state" JSONB,
    "ai_provenance" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_listing_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_auction_preference" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "opening_bid_minor" BIGINT,
    "reserve_minor" BIGINT,
    "increment_minor" BIGINT,
    "currency" TEXT,
    "preferred_open_at" TIMESTAMP(3),
    "preferred_close_at" TIMESTAMP(3),
    "notes" TEXT,
    "status" "SellerAuctionPrefStatus" NOT NULL DEFAULT 'requested',
    "reviewed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_auction_preference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seller_listing_draft_owner_id_status_idx" ON "seller_listing_draft"("owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seller_auction_preference_listing_id_key" ON "seller_auction_preference"("listing_id");

-- CreateIndex
CREATE INDEX "seller_auction_preference_owner_id_idx" ON "seller_auction_preference"("owner_id");

-- CreateIndex
CREATE INDEX "seller_auction_preference_status_idx" ON "seller_auction_preference"("status");

-- AddForeignKey
ALTER TABLE "seller_listing_draft" ADD CONSTRAINT "seller_listing_draft_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_auction_preference" ADD CONSTRAINT "seller_auction_preference_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
