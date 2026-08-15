-- AlterTable
ALTER TABLE "offer" ADD COLUMN     "award_policy" TEXT,
ADD COLUMN     "current_revision_id" TEXT,
ADD COLUMN     "revealed_at" TIMESTAMP(3),
ADD COLUMN     "sale_method_code" TEXT,
ADD COLUMN     "sealed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "offer_revision" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "author_type" TEXT NOT NULL,
    "author_id" TEXT,
    "total_price_minor" BIGINT,
    "unit_price_minor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "quantity" DECIMAL(38,9),
    "quantity_unit_code" TEXT,
    "incoterm" TEXT,
    "origin_location_id" TEXT,
    "destination_location_id" TEXT,
    "delivery_date" TIMESTAMP(3),
    "delivery_window_start" TIMESTAMP(3),
    "delivery_window_end" TIMESTAMP(3),
    "payment_terms" TEXT,
    "freight_responsibility" TEXT,
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "conditions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offer_revision_offer_id_idx" ON "offer_revision"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "offer_revision_offer_id_revision_number_key" ON "offer_revision"("offer_id", "revision_number");

-- AddForeignKey
ALTER TABLE "offer_revision" ADD CONSTRAINT "offer_revision_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

