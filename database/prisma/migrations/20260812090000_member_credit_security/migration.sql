-- Member identity, credit, security & performance engine (Revision 05).
-- ADDITIVE + expand-migrate-verify: new enums, tables and two nullable, uniquely
-- constrained human-readable reference columns, backfilled from atomic sequences.
-- No permanent customer/organization IDs change; all bid/payment/audit history
-- is untouched.

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('pending', 'temporary', 'active', 'suspended', 'blocked', 'expired');
CREATE TYPE "GrantScopeType" AS ENUM ('platform', 'event', 'auction', 'category');
CREATE TYPE "AccessGrantStatus" AS ENUM ('active', 'expired', 'revoked');
CREATE TYPE "SecurityInstrumentType" AS ENUM ('cash_deposit', 'bank_guarantee', 'spot_deposit');
CREATE TYPE "SecurityInstrumentStatus" AS ENUM ('pending_verification', 'verified', 'active', 'expired', 'release_pending', 'released', 'rejected', 'cancelled');
CREATE TYPE "CreditFacilityStatus" AS ENUM ('pending', 'active', 'review_required', 'suspended', 'expired', 'closed');
CREATE TYPE "CreditDecisionType" AS ENUM ('calculate', 'approve', 'cap', 'uplift', 'suspend', 'reactivate', 'close', 'override');
CREATE TYPE "CreditReservationStatus" AS ENUM ('active', 'released', 'converted');
CREATE TYPE "PerformanceContext" AS ENUM ('buyer', 'seller');
CREATE TYPE "MemberFlagContext" AS ENUM ('buyer', 'seller', 'general');
CREATE TYPE "MemberFlagSeverity" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "MemberFlagStatus" AS ENUM ('open', 'under_review', 'resolved', 'dismissed', 'expired');

-- AlterTable: additive human-readable references (nullable + unique).
ALTER TABLE "customer" ADD COLUMN "client_reference" TEXT;
ALTER TABLE "organization" ADD COLUMN "organization_reference" TEXT;

-- Atomic, never-recycled Client ID / Org reference allocators (Revision 05 §3/§10).
-- A sequence guarantees uniqueness under concurrent registration without MAX()+1.
CREATE SEQUENCE IF NOT EXISTS "customer_client_ref_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "organization_ref_seq" START 1;

-- CreateTable
CREATE TABLE "membership" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'pending',
    "activated_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "blocked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_access_grant" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "scope_type" "GrantScopeType" NOT NULL,
    "scope_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "security_instrument_id" TEXT,
    "credit_facility_id" TEXT,
    "granted_by" TEXT,
    "reason" TEXT,
    "status" "AccessGrantStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "membership_access_grant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_instrument" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "type" "SecurityInstrumentType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "face_amount_minor" BIGINT NOT NULL,
    "eligible_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "eligibility_bps" INTEGER NOT NULL DEFAULT 10000,
    "status" "SecurityInstrumentStatus" NOT NULL DEFAULT 'pending_verification',
    "reference" TEXT,
    "issuing_bank" TEXT,
    "guarantee_number" TEXT,
    "issue_date" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "document_media_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "released_at" TIMESTAMP(3),
    "released_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "security_instrument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_facility" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "scope_type" "GrantScopeType" NOT NULL DEFAULT 'platform',
    "scope_id" TEXT,
    "calculated_base_limit_minor" BIGINT NOT NULL DEFAULT 0,
    "approved_limit_minor" BIGINT NOT NULL DEFAULT 0,
    "temporary_uplift_minor" BIGINT NOT NULL DEFAULT 0,
    "status" "CreditFacilityStatus" NOT NULL DEFAULT 'pending',
    "required_security_bps" INTEGER NOT NULL DEFAULT 500,
    "policy_version" TEXT NOT NULL DEFAULT 'credit-v1',
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "approval_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "credit_facility_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_facility_security" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "security_instrument_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_facility_security_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_decision" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "decision_type" "CreditDecisionType" NOT NULL,
    "previous_limit_minor" BIGINT,
    "new_limit_minor" BIGINT,
    "reason" TEXT,
    "decided_by" TEXT,
    "second_approver" TEXT,
    "policy_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_decision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_reservation" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "status" "CreditReservationStatus" NOT NULL DEFAULT 'active',
    "converted_to_sale_id" TEXT,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "credit_reservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_event" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "context" "PerformanceContext" NOT NULL,
    "event_type" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "source_entity_type" TEXT,
    "source_entity_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "performance_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_snapshot" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "context" "PerformanceContext" NOT NULL,
    "score" INTEGER,
    "band" TEXT NOT NULL,
    "rule_version" TEXT NOT NULL,
    "components" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "performance_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_flag" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "context" "MemberFlagContext" NOT NULL DEFAULT 'general',
    "category" TEXT NOT NULL,
    "severity" "MemberFlagSeverity" NOT NULL DEFAULT 'low',
    "status" "MemberFlagStatus" NOT NULL DEFAULT 'open',
    "reason_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "private_note" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "created_by" TEXT,
    "reviewed_by" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_client_reference_key" ON "customer"("client_reference");
CREATE UNIQUE INDEX "organization_organization_reference_key" ON "organization"("organization_reference");
CREATE INDEX "membership_customer_id_idx" ON "membership"("customer_id");
CREATE INDEX "membership_status_idx" ON "membership"("status");
CREATE INDEX "membership_access_grant_customer_id_idx" ON "membership_access_grant"("customer_id");
CREATE INDEX "membership_access_grant_scope_type_scope_id_idx" ON "membership_access_grant"("scope_type", "scope_id");
CREATE INDEX "membership_access_grant_status_idx" ON "membership_access_grant"("status");
CREATE INDEX "security_instrument_customer_id_idx" ON "security_instrument"("customer_id");
CREATE INDEX "security_instrument_status_idx" ON "security_instrument"("status");
CREATE INDEX "security_instrument_expires_at_idx" ON "security_instrument"("expires_at");
CREATE INDEX "credit_facility_customer_id_idx" ON "credit_facility"("customer_id");
CREATE INDEX "credit_facility_status_idx" ON "credit_facility"("status");
CREATE UNIQUE INDEX "credit_facility_security_facility_id_security_instrument_id_key" ON "credit_facility_security"("facility_id", "security_instrument_id");
CREATE INDEX "credit_facility_security_security_instrument_id_idx" ON "credit_facility_security"("security_instrument_id");
CREATE INDEX "credit_decision_facility_id_idx" ON "credit_decision"("facility_id");
CREATE UNIQUE INDEX "credit_reservation_source_type_source_id_key" ON "credit_reservation"("source_type", "source_id");
CREATE INDEX "credit_reservation_customer_id_status_idx" ON "credit_reservation"("customer_id", "status");
CREATE INDEX "credit_reservation_facility_id_status_idx" ON "credit_reservation"("facility_id", "status");
CREATE INDEX "performance_event_customer_id_context_idx" ON "performance_event"("customer_id", "context");
CREATE INDEX "performance_snapshot_customer_id_context_idx" ON "performance_snapshot"("customer_id", "context");
CREATE INDEX "member_flag_customer_id_status_idx" ON "member_flag"("customer_id", "status");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_access_grant" ADD CONSTRAINT "membership_access_grant_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_instrument" ADD CONSTRAINT "security_instrument_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_instrument" ADD CONSTRAINT "security_instrument_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_facility" ADD CONSTRAINT "credit_facility_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_facility_security" ADD CONSTRAINT "credit_facility_security_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "credit_facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_facility_security" ADD CONSTRAINT "credit_facility_security_security_instrument_id_fkey" FOREIGN KEY ("security_instrument_id") REFERENCES "security_instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_decision" ADD CONSTRAINT "credit_decision_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "credit_facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "credit_facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_event" ADD CONSTRAINT "performance_event_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_snapshot" ADD CONSTRAINT "performance_snapshot_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_flag" ADD CONSTRAINT "member_flag_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill step (resumable, atomic, no collisions): assign a Client ID to every
-- existing customer that lacks one, in a stable order (ULID id is monotonic), by
-- drawing from the atomic sequence. Re-running only fills rows still NULL.
UPDATE "customer" c
SET "client_reference" = 'CUS-' || LPAD(nextval('customer_client_ref_seq')::text, 6, '0')
FROM (
  SELECT "id" FROM "customer" WHERE "client_reference" IS NULL ORDER BY "created_at", "id"
) ordered
WHERE c."id" = ordered."id";

UPDATE "organization" o
SET "organization_reference" = 'ORG-' || LPAD(nextval('organization_ref_seq')::text, 6, '0')
FROM (
  SELECT "id" FROM "organization" WHERE "organization_reference" IS NULL ORDER BY "created_at", "id"
) ordered
WHERE o."id" = ordered."id";
