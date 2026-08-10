-- AlterTable
ALTER TABLE "auction" ALTER COLUMN "opening_bid_minor" SET DATA TYPE BIGINT,
ALTER COLUMN "reserve_minor" SET DATA TYPE BIGINT,
ALTER COLUMN "increment_minor" SET DATA TYPE BIGINT,
ALTER COLUMN "current_bid_minor" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "bid" ALTER COLUMN "amount_minor" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "bidder_max" ALTER COLUMN "max_minor" SET DATA TYPE BIGINT;
