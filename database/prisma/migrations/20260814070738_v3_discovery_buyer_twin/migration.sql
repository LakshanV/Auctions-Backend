-- CreateTable
CREATE TABLE "discovery_event" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "anonymous_session_id" TEXT,
    "listing_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "source_surface" TEXT NOT NULL DEFAULT 'FLOW',
    "band_context" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_twin_projection" (
    "customer_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "built_at" TIMESTAMP(3) NOT NULL,
    "signal_count" INTEGER NOT NULL,

    CONSTRAINT "buyer_twin_projection_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "recommendation_impression" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "listing_id" TEXT NOT NULL,
    "surface" TEXT NOT NULL DEFAULT 'DISCOVER',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_impression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discovery_event_customer_id_created_at_idx" ON "discovery_event"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "discovery_event_anonymous_session_id_created_at_idx" ON "discovery_event"("anonymous_session_id", "created_at");

-- CreateIndex
CREATE INDEX "discovery_event_listing_id_idx" ON "discovery_event"("listing_id");

-- CreateIndex
CREATE INDEX "recommendation_impression_customer_id_listing_id_idx" ON "recommendation_impression"("customer_id", "listing_id");

-- AddForeignKey
ALTER TABLE "discovery_event" ADD CONSTRAINT "discovery_event_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_event" ADD CONSTRAINT "discovery_event_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_twin_projection" ADD CONSTRAINT "buyer_twin_projection_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
