-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'pending', 'closed');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageProvenance" AS ENUM ('customer', 'staff', 'ai', 'system');

-- CreateEnum
CREATE TYPE "BidIntentStatus" AS ENUM ('pending', 'confirmed', 'placed', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "channel" "ChannelType" NOT NULL,
    "external_thread_id" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "ai_mode" BOOLEAN NOT NULL DEFAULT true,
    "assigned_agent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "provider_message_id" TEXT,
    "sender" TEXT,
    "text" TEXT,
    "payload" JSONB,
    "provenance" "MessageProvenance" NOT NULL DEFAULT 'customer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_intent" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "max_amount_minor" BIGINT NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'web',
    "status" "BidIntentStatus" NOT NULL DEFAULT 'pending',
    "bid_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "bid_intent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_customer_id_idx" ON "conversation"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_channel_external_thread_id_key" ON "conversation"("channel", "external_thread_id");

-- CreateIndex
CREATE INDEX "message_conversation_id_idx" ON "message"("conversation_id");

-- CreateIndex
CREATE INDEX "bid_intent_customer_id_idx" ON "bid_intent"("customer_id");

-- CreateIndex
CREATE INDEX "bid_intent_auction_id_idx" ON "bid_intent"("auction_id");

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
