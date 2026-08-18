-- CreateEnum
CREATE TYPE "InspectionEvidenceStatus" AS ENUM ('requested', 'scheduled', 'in_progress', 'completed', 'failed');

-- CreateTable
CREATE TABLE "asset_inspection_evidence" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "InspectionEvidenceStatus" NOT NULL DEFAULT 'requested',
    "certificate_ref" TEXT,
    "inspection_id" TEXT,
    "summary" TEXT,
    "inspected_at" TIMESTAMP(3),
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "media_object_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_inspection_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_inspection_evidence_asset_id_idx" ON "asset_inspection_evidence"("asset_id");

-- CreateIndex
CREATE INDEX "asset_inspection_evidence_asset_id_visibility_idx" ON "asset_inspection_evidence"("asset_id", "visibility");

-- AddForeignKey
ALTER TABLE "asset_inspection_evidence" ADD CONSTRAINT "asset_inspection_evidence_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_inspection_evidence" ADD CONSTRAINT "asset_inspection_evidence_media_object_id_fkey" FOREIGN KEY ("media_object_id") REFERENCES "media_object"("id") ON DELETE SET NULL ON UPDATE CASCADE;
