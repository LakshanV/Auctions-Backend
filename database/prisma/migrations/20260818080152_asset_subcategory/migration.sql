-- AlterTable
ALTER TABLE "asset" ADD COLUMN     "subcategory" TEXT;

-- CreateIndex
CREATE INDEX "asset_category_subcategory_idx" ON "asset"("category", "subcategory");
