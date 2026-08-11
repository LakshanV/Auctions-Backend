-- Durable institutional-seller attribution (pack 01 doc 09).
-- Expand step (additive, nullable): history must not depend on current org
-- membership, so seller-org is captured on the enduring Asset and on the Sale
-- financial record rather than derived from the owner's live membership.

-- AlterTable
ALTER TABLE "asset" ADD COLUMN     "seller_organization_id" TEXT;

-- AlterTable
ALTER TABLE "sale" ADD COLUMN     "seller_organization_id" TEXT;

-- CreateIndex
CREATE INDEX "asset_seller_organization_id_idx" ON "asset"("seller_organization_id");

-- CreateIndex
CREATE INDEX "sale_seller_organization_id_idx" ON "sale"("seller_organization_id");

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_seller_organization_id_fkey" FOREIGN KEY ("seller_organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_seller_organization_id_fkey" FOREIGN KEY ("seller_organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill step (provenance-safe): attribute existing assets to their owner's
-- organization ONLY where unambiguous — the owner belongs to exactly one
-- organization at migration time. Ambiguous (multi-org) or unaffiliated owners
-- are left NULL to be set explicitly at consignment — we never guess.
UPDATE "asset" a
SET "seller_organization_id" = m."organization_id"
FROM "organization_member" m
WHERE m."customer_id" = a."owner_customer_id"
  AND a."seller_organization_id" IS NULL
  AND (
    SELECT COUNT(*) FROM "organization_member" m2
    WHERE m2."customer_id" = a."owner_customer_id"
  ) = 1;

-- Backfill sales from their listing's asset attribution (already unambiguous).
UPDATE "sale" s
SET "seller_organization_id" = a."seller_organization_id"
FROM "listing" l
JOIN "asset" a ON a."id" = l."asset_id"
WHERE l."id" = s."listing_id"
  AND s."seller_organization_id" IS NULL
  AND a."seller_organization_id" IS NOT NULL;
