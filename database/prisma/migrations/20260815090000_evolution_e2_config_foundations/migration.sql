-- CreateEnum
CREATE TYPE "UnitKind" AS ENUM ('count', 'weight', 'volume', 'area', 'length');

-- CreateEnum
CREATE TYPE "OperatorType" AS ENUM ('company', 'subsidiary', 'sister_company', 'trading_business', 'custodian', 'agent', 'representative', 'marketplace_operator', 'local_service_company');

-- CreateEnum
CREATE TYPE "ConfigVerification" AS ENUM ('draft', 'unverified', 'verified');

-- CreateEnum
CREATE TYPE "MarketNodeMode" AS ENUM ('DISCOVERY', 'LOCAL_COMMERCE');

-- CreateTable
CREATE TABLE "unit_definition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "plural" TEXT,
    "kind" "UnitKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_method_definition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "is_auction" BOOLEAN NOT NULL DEFAULT false,
    "binds_automatically" BOOLEAN NOT NULL DEFAULT false,
    "requires_eligibility" BOOLEAN NOT NULL DEFAULT false,
    "legacy_enum" "SaleMethod",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_method_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "default_currency" TEXT NOT NULL,
    "default_language" TEXT,
    "default_timezone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "public_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "type" "OperatorType" NOT NULL DEFAULT 'marketplace_operator',
    "verification" "ConfigVerification" NOT NULL DEFAULT 'draft',
    "disclosure" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_market" (
    "id" TEXT NOT NULL,
    "operator_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,

    CONSTRAINT "operator_market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT,
    "locality" TEXT,
    "address_line" TEXT,
    "postal_code" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_node" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "MarketNodeMode" NOT NULL DEFAULT 'DISCOVERY',
    "primary_market_id" TEXT,
    "default_currency" TEXT,
    "default_language" TEXT,
    "default_location_country" TEXT,
    "can_originate_listings" BOOLEAN NOT NULL DEFAULT false,
    "can_take_offers" BOOLEAN NOT NULL DEFAULT false,
    "can_run_auctions" BOOLEAN NOT NULL DEFAULT false,
    "can_accept_payments" BOOLEAN NOT NULL DEFAULT false,
    "verification" "ConfigVerification" NOT NULL DEFAULT 'draft',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_node_operator" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "operator_id" TEXT NOT NULL,

    CONSTRAINT "market_node_operator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_definition_code_key" ON "unit_definition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sale_method_definition_code_key" ON "sale_method_definition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "market_code_key" ON "market"("code");

-- CreateIndex
CREATE UNIQUE INDEX "operator_code_key" ON "operator"("code");

-- CreateIndex
CREATE INDEX "operator_market_market_id_idx" ON "operator_market"("market_id");

-- CreateIndex
CREATE UNIQUE INDEX "operator_market_operator_id_market_id_key" ON "operator_market"("operator_id", "market_id");

-- CreateIndex
CREATE INDEX "location_country_code_idx" ON "location"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "market_node_code_key" ON "market_node"("code");

-- CreateIndex
CREATE INDEX "market_node_primary_market_id_idx" ON "market_node"("primary_market_id");

-- CreateIndex
CREATE INDEX "market_node_operator_operator_id_idx" ON "market_node_operator"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_node_operator_node_id_operator_id_key" ON "market_node_operator"("node_id", "operator_id");

-- AddForeignKey
ALTER TABLE "operator_market" ADD CONSTRAINT "operator_market_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_market" ADD CONSTRAINT "operator_market_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_node" ADD CONSTRAINT "market_node_primary_market_id_fkey" FOREIGN KEY ("primary_market_id") REFERENCES "market"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_node_operator" ADD CONSTRAINT "market_node_operator_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "market_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_node_operator" ADD CONSTRAINT "market_node_operator_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

