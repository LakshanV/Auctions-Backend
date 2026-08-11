-- CreateEnum
CREATE TYPE "LiveStatus" AS ENUM ('scheduled', 'live', 'paused', 'ended');

-- CreateTable
CREATE TABLE "live_event" (
    "id" TEXT NOT NULL,
    "auction_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "LiveStatus" NOT NULL DEFAULT 'scheduled',
    "ingest_provider" TEXT NOT NULL DEFAULT 'mock',
    "ingest_url" TEXT,
    "playback_url" TEXT,
    "simulcast_url" TEXT,
    "recording_url" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_event_auction_id_idx" ON "live_event"("auction_id");
