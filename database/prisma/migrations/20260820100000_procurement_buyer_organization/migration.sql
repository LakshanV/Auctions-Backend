-- Durable buyer-organization attribution for procurement requests.
--
-- Expand-only (docs/04 §expand-migrate-verify-contract): the column is NULLABLE with no default and
-- no backfill, so every existing row stays exactly what it is today — a PERSONAL request
-- (buyer_organization_id IS NULL). Nothing is rewritten, nothing is destroyed, and an older
-- application version that does not know the column keeps working unchanged.

-- AlterTable
ALTER TABLE "procurement_request" ADD COLUMN     "buyer_organization_id" TEXT;

-- CreateIndex
CREATE INDEX "procurement_request_buyer_customer_id_idx" ON "procurement_request"("buyer_customer_id");

-- CreateIndex
CREATE INDEX "procurement_request_buyer_organization_id_idx" ON "procurement_request"("buyer_organization_id");

-- AddForeignKey
ALTER TABLE "procurement_request" ADD CONSTRAINT "procurement_request_buyer_organization_id_fkey" FOREIGN KEY ("buyer_organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
