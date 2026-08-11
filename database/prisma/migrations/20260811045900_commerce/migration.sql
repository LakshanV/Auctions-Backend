-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('issued', 'paid', 'void');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('deposit_received', 'sale_charge', 'buyer_premium', 'tax', 'payment_received', 'refund', 'credit_applied', 'settlement_disbursed');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending_verification', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "FulfilmentState" AS ENUM ('payment_pending', 'payment_confirmed', 'release_approved', 'ready_for_pickup', 'pickup_booked', 'in_delivery', 'collected', 'delivered', 'completed');

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "buyer_customer_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "hammer_minor" BIGINT NOT NULL,
    "buyer_premium_minor" BIGINT NOT NULL,
    "tax_minor" BIGINT NOT NULL,
    "other_fees_minor" BIGINT NOT NULL DEFAULT 0,
    "deposit_applied_minor" BIGINT NOT NULL DEFAULT 0,
    "amount_due_minor" BIGINT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'issued',
    "due_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "reference" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'bank_transfer',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending_verification',
    "proof_ref" TEXT,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "state" "FulfilmentState" NOT NULL DEFAULT 'payment_pending',
    "release_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfilment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "sale_proceeds_minor" BIGINT NOT NULL,
    "commission_minor" BIGINT NOT NULL,
    "commission_tax_minor" BIGINT NOT NULL,
    "deductions_minor" BIGINT NOT NULL DEFAULT 0,
    "net_minor" BIGINT NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_number_key" ON "invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_listing_id_key" ON "invoice"("listing_id");

-- CreateIndex
CREATE INDEX "invoice_buyer_customer_id_idx" ON "invoice"("buyer_customer_id");

-- CreateIndex
CREATE INDEX "ledger_entry_listing_id_idx" ON "ledger_entry"("listing_id");

-- CreateIndex
CREATE INDEX "ledger_entry_invoice_id_idx" ON "ledger_entry"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_invoice_id_idx" ON "payment"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_listing_id_key" ON "fulfilment"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_listing_id_key" ON "settlement"("listing_id");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment" ADD CONSTRAINT "fulfilment_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only financial ledger (docs/14): the ledger is the authoritative money
-- record and is never rewritten — corrections are new events (e.g. REFUND).
-- Reject UPDATE and DELETE on ledger_entry, mirroring the bid/audit guarantees.
CREATE OR REPLACE FUNCTION singha_ledger_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'financial ledger is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_no_update
  BEFORE UPDATE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION singha_ledger_append_only();

CREATE TRIGGER ledger_entry_no_delete
  BEFORE DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION singha_ledger_append_only();
