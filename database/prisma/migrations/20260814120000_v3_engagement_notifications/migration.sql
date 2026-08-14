-- CreateTable
CREATE TABLE "notification_preference" (
    "customer_id" TEXT NOT NULL,
    "channels" JSONB NOT NULL DEFAULT '{"in_app":true,"push":false,"email":true,"sms":false,"whatsapp":false}',
    "engagement_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "quiet_start_minute" INTEGER,
    "quiet_end_minute" INTEGER,
    "timezone_offset_minutes" INTEGER NOT NULL DEFAULT 0,
    "frequency_cap_per_day" INTEGER NOT NULL DEFAULT 8,
    "muted_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "notification_delivery" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "channel" TEXT,
    "status" TEXT NOT NULL,
    "suppressed_reason" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_delivery_customer_id_created_at_idx" ON "notification_delivery"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_delivery_status_idx" ON "notification_delivery"("status");

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

