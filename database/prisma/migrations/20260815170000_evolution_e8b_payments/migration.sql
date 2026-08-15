-- CreateTable
CREATE TABLE "payment_route" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "provider" TEXT NOT NULL,
    "provider_kind" TEXT NOT NULL,
    "instructions_ref" TEXT,
    "operator_code" TEXT NOT NULL,
    "currency" TEXT,
    "jurisdiction" TEXT,
    "sale_method_code" TEXT,
    "purpose" TEXT,
    "verification" "ConfigVerification" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intent" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "operator_code" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amount_minor" BIGINT,
    "route_code" TEXT,
    "provider" TEXT,
    "provider_kind" TEXT,
    "requires_manual_settlement" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "input" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_event" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_route_operator_code_active_idx" ON "payment_route"("operator_code", "active");

-- CreateIndex
CREATE UNIQUE INDEX "payment_route_code_version_key" ON "payment_route"("code", "version");

-- CreateIndex
CREATE INDEX "payment_intent_status_created_at_idx" ON "payment_intent"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_event_provider_event_id_key" ON "payment_webhook_event"("provider", "event_id");

