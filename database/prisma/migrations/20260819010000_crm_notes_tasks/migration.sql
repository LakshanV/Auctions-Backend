-- CreateEnum
CREATE TYPE "CrmSubjectType" AS ENUM ('customer', 'organization', 'listing', 'auction', 'sale', 'conversation', 'shipment', 'procurement_request');
-- CreateEnum
CREATE TYPE "CrmNoteVisibility" AS ENUM ('staff', 'restricted');
-- CreateEnum
CREATE TYPE "CrmTaskType" AS ENUM ('call', 'follow_up', 'document_request', 'quality_review', 'post_win_contact', 'shipment_delay', 'payment_action', 'rfq_review', 'inspection', 'general');
-- CreateEnum
CREATE TYPE "CrmTaskPriority" AS ENUM ('low', 'normal', 'high', 'urgent');
-- CreateEnum
CREATE TYPE "CrmTaskStatus" AS ENUM ('open', 'in_progress', 'blocked', 'done', 'cancelled');
-- CreateEnum
CREATE TYPE "CrmTaskSource" AS ENUM ('human', 'ai_suggested');
-- CreateTable
CREATE TABLE "crm_note" (
    "id" TEXT NOT NULL,
    "subject_type" "CrmSubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "CrmNoteVisibility" NOT NULL DEFAULT 'staff',
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_note_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "crm_task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "CrmTaskType" NOT NULL DEFAULT 'general',
    "priority" "CrmTaskPriority" NOT NULL DEFAULT 'normal',
    "status" "CrmTaskStatus" NOT NULL DEFAULT 'open',
    "customer_id" TEXT,
    "organization_id" TEXT,
    "listing_id" TEXT,
    "auction_id" TEXT,
    "sale_id" TEXT,
    "conversation_id" TEXT,
    "shipment_id" TEXT,
    "assignee_id" TEXT,
    "team" TEXT,
    "due_at" TIMESTAMP(3),
    "remind_at" TIMESTAMP(3),
    "source" "CrmTaskSource" NOT NULL DEFAULT 'human',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "created_by" TEXT,
    "completed_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_task_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "crm_note_subject_type_subject_id_idx" ON "crm_note"("subject_type", "subject_id");
-- CreateIndex
CREATE INDEX "crm_task_status_due_at_idx" ON "crm_task"("status", "due_at");
-- CreateIndex
CREATE INDEX "crm_task_assignee_id_status_idx" ON "crm_task"("assignee_id", "status");
-- CreateIndex
CREATE INDEX "crm_task_customer_id_status_idx" ON "crm_task"("customer_id", "status");

-- crm_note is append-only (directive §19: notes have append-only history; corrections are new notes).
CREATE OR REPLACE FUNCTION singha_crm_note_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'crm_note is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_note_no_update
  BEFORE UPDATE ON "crm_note"
  FOR EACH ROW EXECUTE FUNCTION singha_crm_note_append_only();

CREATE TRIGGER crm_note_no_delete
  BEFORE DELETE ON "crm_note"
  FOR EACH ROW EXECUTE FUNCTION singha_crm_note_append_only();
