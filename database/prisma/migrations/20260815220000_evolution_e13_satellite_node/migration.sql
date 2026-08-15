-- CreateTable
CREATE TABLE "node_origination" (
    "id" TEXT NOT NULL,
    "node_code" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "operator_code" TEXT,
    "subject_ref" TEXT,
    "requested_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_origination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "node_origination_node_code_idx" ON "node_origination"("node_code");

