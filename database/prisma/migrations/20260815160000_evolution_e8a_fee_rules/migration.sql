-- CreateTable
CREATE TABLE "fee_rule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "component" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "rate_bps" INTEGER,
    "fixed_minor" BIGINT,
    "applies_to" TEXT NOT NULL DEFAULT 'PRINCIPAL',
    "operator_code" TEXT,
    "jurisdiction" TEXT,
    "category" TEXT,
    "sale_method_code" TEXT,
    "min_principal_minor" BIGINT,
    "max_principal_minor" BIGINT,
    "verification" "ConfigVerification" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_breakdown" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "principal_minor" BIGINT NOT NULL,
    "buyer_fees_minor" BIGINT NOT NULL,
    "tax_minor" BIGINT NOT NULL,
    "buyer_total_minor" BIGINT NOT NULL,
    "seller_commission_minor" BIGINT NOT NULL,
    "seller_proceeds_minor" BIGINT NOT NULL,
    "lines" JSONB,
    "input" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_breakdown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_rule_active_component_idx" ON "fee_rule"("active", "component");

-- CreateIndex
CREATE UNIQUE INDEX "fee_rule_code_version_key" ON "fee_rule"("code", "version");

-- CreateIndex
CREATE INDEX "fee_breakdown_created_at_idx" ON "fee_breakdown"("created_at");

