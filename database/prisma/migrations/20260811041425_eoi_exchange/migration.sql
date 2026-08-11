-- CreateEnum
CREATE TYPE "EoiStatus" AS ENUM ('submitted', 'under_review', 'shortlisted', 'negotiating', 'accepted', 'declined', 'withdrawn', 'expired');

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

-- CreateIndex
CREATE INDEX "eoi_listing_id_idx" ON "eoi"("listing_id");

-- CreateIndex
CREATE INDEX "eoi_customer_id_idx" ON "eoi"("customer_id");

-- CreateIndex
CREATE INDEX "eoi_status_idx" ON "eoi"("status");

-- CreateIndex
CREATE INDEX "eoi_event_eoi_id_idx" ON "eoi_event"("eoi_id");

-- AddForeignKey
ALTER TABLE "eoi" ADD CONSTRAINT "eoi_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eoi_event" ADD CONSTRAINT "eoi_event_eoi_id_fkey" FOREIGN KEY ("eoi_id") REFERENCES "eoi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
