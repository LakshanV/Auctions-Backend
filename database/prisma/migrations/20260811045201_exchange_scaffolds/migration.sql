-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('auction', 'eoi', 'buy_now', 'make_offer', 'sealed_tender', 'live');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('open', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired');

-- CreateEnum
CREATE TYPE "OfferEventType" AS ENUM ('offer', 'counter', 'accept', 'reject', 'withdraw', 'expire');

-- AlterTable
ALTER TABLE "listing" ADD COLUMN     "buy_now_price_minor" BIGINT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'LKR';

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

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_event" ADD CONSTRAINT "offer_event_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_bid" ADD CONSTRAINT "tender_bid_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
