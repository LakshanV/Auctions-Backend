-- CreateTable
CREATE TABLE "procurement_request" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "category" TEXT,
    "specification" TEXT,
    "quantity" DECIMAL(38,9),
    "quantity_unit_code" TEXT,
    "destination_country" TEXT,
    "delivery_by" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "payment_terms" TEXT,
    "operator_code" TEXT,
    "buyer_customer_id" TEXT,
    "submission_close_at" TIMESTAMP(3),
    "awarded_proposal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_proposal" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "supplier_customer_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "total_price_minor" BIGINT,
    "unit_price_minor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "quantity" DECIMAL(38,9),
    "quantity_unit_code" TEXT,
    "incoterm" TEXT,
    "delivery_date" TIMESTAMP(3),
    "payment_terms" TEXT,
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procurement_request_status_idx" ON "procurement_request"("status");

-- CreateIndex
CREATE INDEX "procurement_proposal_request_id_idx" ON "procurement_proposal"("request_id");

-- AddForeignKey
ALTER TABLE "procurement_proposal" ADD CONSTRAINT "procurement_proposal_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "procurement_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

