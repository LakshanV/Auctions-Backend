-- CreateTable
CREATE TABLE "intelligence_report" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "requested_by_customer_id" TEXT,
    "subject_ref" TEXT,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligence_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intelligence_report_kind_idx" ON "intelligence_report"("kind");

