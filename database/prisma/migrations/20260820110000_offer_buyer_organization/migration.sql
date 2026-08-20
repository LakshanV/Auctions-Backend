-- Durable buyer-organization attribution for commercial offers.
--
-- Expand-only (docs/04 §expand-migrate-verify-contract): the column is NULLABLE with no default and
-- no backfill, so every existing offer stays exactly what it is today — a PERSONAL offer
-- (buyer_organization_id IS NULL). No bid/offer history is rewritten (rule 5: offer revisions and
-- the negotiation trail are immutable), and an older application version that does not know the
-- column keeps working unchanged.

-- AlterTable
ALTER TABLE "offer" ADD COLUMN     "buyer_organization_id" TEXT;

-- CreateIndex
CREATE INDEX "offer_buyer_organization_id_idx" ON "offer"("buyer_organization_id");

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_buyer_organization_id_fkey" FOREIGN KEY ("buyer_organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
