-- CreateEnum
CREATE TYPE "LiveLotState" AS ENUM ('pending', 'on_block', 'going_once', 'going_twice', 'sold', 'passed', 'withdrawn');

-- AlterTable
ALTER TABLE "auction_event" ADD COLUMN     "current_lot_id" TEXT;

-- AlterTable
ALTER TABLE "auction_event_lot" ADD COLUMN     "live_state" "LiveLotState" NOT NULL DEFAULT 'pending',
ADD COLUMN     "sold_at" TIMESTAMP(3);
