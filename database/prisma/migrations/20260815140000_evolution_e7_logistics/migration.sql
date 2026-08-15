-- CreateTable
CREATE TABLE "logistics_node" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "country_code" TEXT,
    "city" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_provider" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modes" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verification" "ConfigVerification" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_quote" (
    "id" TEXT NOT NULL,
    "origin_node_code" TEXT NOT NULL,
    "destination_node_code" TEXT NOT NULL,
    "transport_mode" TEXT NOT NULL,
    "incoterm" TEXT NOT NULL,
    "freight_arranger" TEXT NOT NULL,
    "chargeable_units" INTEGER NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "provider" TEXT NOT NULL,
    "assumptions" JSONB,
    "status" TEXT NOT NULL DEFAULT 'QUOTED',
    "quoted_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "logistics_node_code_key" ON "logistics_node"("code");

-- CreateIndex
CREATE INDEX "logistics_node_kind_active_idx" ON "logistics_node"("kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_provider_code_key" ON "logistics_provider"("code");

-- CreateIndex
CREATE INDEX "logistics_quote_status_created_at_idx" ON "logistics_quote"("status", "created_at");

