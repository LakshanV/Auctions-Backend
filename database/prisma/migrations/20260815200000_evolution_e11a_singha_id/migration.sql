-- CreateTable
CREATE TABLE "customer_profile" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "country_residency" TEXT,
    "display_currency" TEXT,
    "language" TEXT,
    "timezone" TEXT,
    "company_roles" JSONB,
    "notification_prefs" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_capability" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "evidence_ref" TEXT,
    "decided_by_customer_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_capability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_profile_customer_id_key" ON "customer_profile"("customer_id");

-- CreateIndex
CREATE INDEX "customer_capability_customer_id_idx" ON "customer_capability"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_capability_customer_id_capability_key" ON "customer_capability"("customer_id", "capability");

