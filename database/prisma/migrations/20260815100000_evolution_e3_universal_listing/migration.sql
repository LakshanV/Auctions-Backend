-- AlterTable
ALTER TABLE "listing" ADD COLUMN     "asset_location_id" TEXT,
ADD COLUMN     "custodian_location_id" TEXT,
ADD COLUMN     "destination_location_id" TEXT,
ADD COLUMN     "export_origin_location_id" TEXT,
ADD COLUMN     "min_order_quantity" DECIMAL(38,9),
ADD COLUMN     "operator_id" TEXT,
ADD COLUMN     "origin_node_id" TEXT,
ADD COLUMN     "pickup_location_id" TEXT,
ADD COLUMN     "pricing_basis" TEXT,
ADD COLUMN     "quantity_available" DECIMAL(38,9),
ADD COLUMN     "quantity_unit_code" TEXT,
ADD COLUMN     "sale_method_code" TEXT,
ADD COLUMN     "seller_location_id" TEXT,
ADD COLUMN     "unit_price_minor" BIGINT;

-- CreateIndex
CREATE INDEX "listing_operator_id_idx" ON "listing"("operator_id");

-- CreateIndex
CREATE INDEX "listing_origin_node_id_idx" ON "listing"("origin_node_id");

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_asset_location_id_fkey" FOREIGN KEY ("asset_location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_seller_location_id_fkey" FOREIGN KEY ("seller_location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_custodian_location_id_fkey" FOREIGN KEY ("custodian_location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_pickup_location_id_fkey" FOREIGN KEY ("pickup_location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_export_origin_location_id_fkey" FOREIGN KEY ("export_origin_location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_origin_node_id_fkey" FOREIGN KEY ("origin_node_id") REFERENCES "market_node"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill (Evolution E3, DECISIONS D3): populate the new configurable sale-method code
-- from the existing enum for all pre-existing rows. Idempotent (only fills NULLs); the
-- enum→text cast yields the label, which equals the definition code for legacy methods.
UPDATE "listing" SET "sale_method_code" = "sale_method"::text WHERE "sale_method_code" IS NULL;
