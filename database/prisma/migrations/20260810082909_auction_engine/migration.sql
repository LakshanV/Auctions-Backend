-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('scheduled', 'open', 'paused', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "BidSource" AS ENUM ('online', 'floor', 'phone', 'absentee', 'proxy', 'auctioneer');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('accepted', 'rejected', 'reversed');

-- CreateTable
CREATE TABLE "auction" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'scheduled',
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "opening_bid_minor" INTEGER NOT NULL,
    "reserve_minor" INTEGER,
    "reserve_visible" BOOLEAN NOT NULL DEFAULT false,
    "increment_minor" INTEGER NOT NULL,
    "soft_close_trigger_sec" INTEGER NOT NULL DEFAULT 10,
    "soft_close_extend_sec" INTEGER NOT NULL DEFAULT 20,
    "buyer_premium_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "current_bid_minor" INTEGER,
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
    "amount_minor" INTEGER NOT NULL,
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
    "max_minor" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bidder_max_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "auction" ADD CONSTRAINT "auction_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid" ADD CONSTRAINT "bid_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bidder_max" ADD CONSTRAINT "bidder_max_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
