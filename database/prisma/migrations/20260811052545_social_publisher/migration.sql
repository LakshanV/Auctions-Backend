-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('facebook', 'instagram');

-- CreateEnum
CREATE TYPE "SocialPublicationStatus" AS ENUM ('draft', 'scheduled', 'published', 'failed');

-- CreateEnum
CREATE TYPE "SocialCampaignType" AS ENUM ('individual', 'group');

-- CreateTable
CREATE TABLE "social_campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SocialCampaignType" NOT NULL DEFAULT 'individual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_publication" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT,
    "campaign_id" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "status" "SocialPublicationStatus" NOT NULL DEFAULT 'draft',
    "caption" TEXT NOT NULL,
    "creative_ref" TEXT,
    "ai_run_id" TEXT,
    "external_post_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_publication_listing_id_idx" ON "social_publication"("listing_id");

-- CreateIndex
CREATE INDEX "social_publication_campaign_id_idx" ON "social_publication"("campaign_id");

-- CreateIndex
CREATE INDEX "social_publication_status_idx" ON "social_publication"("status");

-- AddForeignKey
ALTER TABLE "social_publication" ADD CONSTRAINT "social_publication_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "social_campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
