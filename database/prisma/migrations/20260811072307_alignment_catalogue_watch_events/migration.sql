-- CreateEnum
CREATE TYPE "AuctionEventType" AS ENUM ('timed', 'live', 'hybrid', 'sequential');

-- CreateEnum
CREATE TYPE "AuctionEventStatus" AS ENUM ('draft', 'scheduled', 'live', 'ended', 'cancelled');

-- AlterTable
ALTER TABLE "listing" ADD COLUMN     "closes_at" TIMESTAMP(3),
ADD COLUMN     "collection_summary" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "full_description" TEXT,
ADD COLUMN     "guide_price_minor" BIGINT,
ADD COLUMN     "inspection_summary" TEXT,
ADD COLUMN     "location_city" TEXT,
ADD COLUMN     "location_region" TEXT,
ADD COLUMN     "opens_at" TIMESTAMP(3),
ADD COLUMN     "public_terms_ref" TEXT,
ADD COLUMN     "seo_description" TEXT,
ADD COLUMN     "seo_title" TEXT,
ADD COLUMN     "short_description" TEXT,
ADD COLUMN     "show_guide_price" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "media_object" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "duration_ms" INTEGER,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "is_cover" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mime_type" TEXT,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'public',
ADD COLUMN     "width" INTEGER;

-- CreateTable
CREATE TABLE "watch" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_event" (
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
CREATE TABLE "auction_event_lot" (
    "id" TEXT NOT NULL,
    "auction_event_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "lane" TEXT,
    "scheduled_start" TIMESTAMP(3),

    CONSTRAINT "auction_event_lot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watch_customer_id_idx" ON "watch"("customer_id");

-- CreateIndex
CREATE INDEX "watch_listing_id_idx" ON "watch"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "watch_customer_id_listing_id_key" ON "watch"("customer_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_event_public_ref_key" ON "auction_event"("public_ref");

-- CreateIndex
CREATE INDEX "auction_event_status_idx" ON "auction_event"("status");

-- CreateIndex
CREATE INDEX "auction_event_featured_idx" ON "auction_event"("featured");

-- CreateIndex
CREATE INDEX "auction_event_lot_listing_id_idx" ON "auction_event_lot"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_event_lot_auction_event_id_listing_id_key" ON "auction_event_lot"("auction_event_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_event_lot_auction_event_id_sequence_key" ON "auction_event_lot"("auction_event_id", "sequence");

-- CreateIndex
CREATE INDEX "listing_featured_idx" ON "listing"("featured");

-- CreateIndex
CREATE INDEX "media_object_asset_id_sort_order_idx" ON "media_object"("asset_id", "sort_order");

-- AddForeignKey
ALTER TABLE "watch" ADD CONSTRAINT "watch_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_event_lot" ADD CONSTRAINT "auction_event_lot_auction_event_id_fkey" FOREIGN KEY ("auction_event_id") REFERENCES "auction_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_event_lot" ADD CONSTRAINT "auction_event_lot_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
