-- CreateEnum
CREATE TYPE "AiTaskType" AS ENUM ('listing_draft', 'media_caption', 'assistant', 'translation', 'recommendation', 'support');

-- CreateTable
CREATE TABLE "ai_run" (
    "id" TEXT NOT NULL,
    "task_type" "AiTaskType" NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "actor_id" TEXT,
    "subject_type" TEXT,
    "subject_id" TEXT,
    "prompt" TEXT,
    "output" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "applied_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_run_subject_type_subject_id_idx" ON "ai_run"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "ai_run_task_type_idx" ON "ai_run"("task_type");
