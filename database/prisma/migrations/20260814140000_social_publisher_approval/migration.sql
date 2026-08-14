-- Social Publisher approval lifecycle (docs/11 "human approval" gate).
-- Additive-only: two new enum values and two new nullable columns. No existing
-- row, value or column is touched — draft/scheduled/published/failed and every
-- current social_publication row are unaffected.
--
-- Each ADD VALUE is its own statement and this file (like its neighbours in
-- this directory) has no explicit BEGIN/COMMIT wrapper: on PostgreSQL < 12 a
-- value added by ALTER TYPE ... ADD VALUE cannot be read/compared/inserted in
-- the same transaction that added it, so the new values must be committed
-- before anything (a later migration, a seed, the app) can use them.

-- AlterEnum
ALTER TYPE "SocialPublicationStatus" ADD VALUE 'pending_approval';
ALTER TYPE "SocialPublicationStatus" ADD VALUE 'approved';

-- AlterTable
ALTER TABLE "social_publication" ADD COLUMN "approved_by_id" TEXT,
ADD COLUMN "approved_at" TIMESTAMP(3);
