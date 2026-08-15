-- CreateTable
CREATE TABLE "supply_programme" (
    "id" TEXT NOT NULL,
    "supplier_customer_id" TEXT,
    "product" TEXT NOT NULL,
    "category" TEXT,
    "origin_country" TEXT,
    "available_quantity" DECIMAL(38,9),
    "quantity_unit_code" TEXT,
    "frequency" TEXT,
    "min_order_quantity" DECIMAL(38,9),
    "max_order_quantity" DECIMAL(38,9),
    "pricing_basis" TEXT,
    "indicative_price_minor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "packing" TEXT,
    "quality" TEXT,
    "incoterm" TEXT,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "lead_time_days" INTEGER,
    "operator_code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perishable_metadata" (
    "id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "harvest_date" TIMESTAMP(3),
    "packing_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "variety" TEXT,
    "grade" TEXT,
    "size" TEXT,
    "moisture_percent" DECIMAL(6,3),
    "quality_spec" TEXT,
    "cold_chain" BOOLEAN NOT NULL DEFAULT false,
    "temp_min_c" DECIMAL(6,2),
    "temp_max_c" DECIMAL(6,2),
    "phytosanitary_cert" BOOLEAN NOT NULL DEFAULT false,
    "origin_cert" BOOLEAN NOT NULL DEFAULT false,
    "available_quantity" DECIMAL(38,9),
    "min_quantity" DECIMAL(38,9),
    "shipment_window_start" TIMESTAMP(3),
    "shipment_window_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perishable_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supply_programme_status_idx" ON "supply_programme"("status");

-- CreateIndex
CREATE INDEX "supply_programme_category_idx" ON "supply_programme"("category");

-- CreateIndex
CREATE UNIQUE INDEX "perishable_metadata_subject_type_subject_id_key" ON "perishable_metadata"("subject_type", "subject_id");

