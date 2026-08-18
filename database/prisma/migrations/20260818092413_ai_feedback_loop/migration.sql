-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" TEXT NOT NULL,
    "ai_run_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "corrected_fields" JSONB,
    "note" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_feedback_ai_run_id_idx" ON "ai_feedback"("ai_run_id");

-- CreateIndex
CREATE INDEX "ai_feedback_outcome_idx" ON "ai_feedback"("outcome");

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
