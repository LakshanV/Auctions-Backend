-- CreateTable
CREATE TABLE "routing_rule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sale_method_code" TEXT,
    "category" TEXT,
    "market_code" TEXT,
    "jurisdiction" TEXT,
    "operator_code" TEXT,
    "origin_node_code" TEXT,
    "destination_country" TEXT,
    "transaction_operator_code" TEXT,
    "payment_route_code" TEXT,
    "terms_code" TEXT,
    "disclosure" TEXT,
    "requires_kyc" BOOLEAN NOT NULL DEFAULT false,
    "requires_licence" BOOLEAN NOT NULL DEFAULT false,
    "verification" "ConfigVerification" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_document" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "layer" TEXT NOT NULL,
    "operator_code" TEXT,
    "jurisdiction" TEXT,
    "category" TEXT,
    "sale_method_code" TEXT,
    "body_ref" TEXT,
    "verification" "ConfigVerification" NOT NULL DEFAULT 'draft',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terms_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_decision" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sale_method_code" TEXT,
    "matched_rule_code" TEXT,
    "matched_rule_version" INTEGER,
    "transaction_operator_code" TEXT,
    "payment_route_code" TEXT,
    "terms_code" TEXT,
    "reason" TEXT,
    "input" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "routing_rule_active_idx" ON "routing_rule"("active");

-- CreateIndex
CREATE UNIQUE INDEX "routing_rule_code_version_key" ON "routing_rule"("code", "version");

-- CreateIndex
CREATE INDEX "terms_document_layer_active_idx" ON "terms_document"("layer", "active");

-- CreateIndex
CREATE UNIQUE INDEX "terms_document_code_version_key" ON "terms_document"("code", "version");

-- CreateIndex
CREATE INDEX "routing_decision_status_created_at_idx" ON "routing_decision"("status", "created_at");

