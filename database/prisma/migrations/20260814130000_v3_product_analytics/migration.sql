-- CreateTable
CREATE TABLE "product_event" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "anonymous_session_id" TEXT,
    "surface" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "listing_id" TEXT,
    "funnel_step" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_event_surface_created_at_idx" ON "product_event"("surface", "created_at");

-- CreateIndex
CREATE INDEX "product_event_customer_id_created_at_idx" ON "product_event"("customer_id", "created_at");

